import { WhatsappPhoneNumber, Message, EcommerceOrder, User } from '../models/index.js';
import {
  isWithinWorkingHours,
  findMatchingBot,
  sendAutomatedReply,
  assignRoundRobin
} from '../utils/automated-response.service.js';
import db from '../models/index.js';
const { WabaConfiguration } = db;
import { parseIncomingMessage, getWhatsAppMediaUrl, downloadAndStoreMedia } from '../utils/whatsapp-message-handler.js';
import automationEngine from '../utils/automation-engine.js';
import { updateWhatsAppStatus } from '../utils/message-status.service.js';
import { updateCampaignStatsFromWhatsApp } from '../utils/campaign-stats.service.js';
import { sendPushNotification } from '../utils/one-signal.js';


export const handleWebhookVerification = (req, res) => {
  console.log("called");
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};




export const handleIncomingMessage = async (req, res, io = null) => {
  try {
    console.log("WhatsApp webhook called");

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) {
      return res.sendStatus(200);
    }

    const message = value.messages[0];
    const phoneNumberId = value.metadata.phone_number_id;

    const whatsappPhoneNumber = await WhatsappPhoneNumber.findOne({
      phone_number_id: phoneNumberId
    })
      .populate('waba_id')
      .lean();

    if (!whatsappPhoneNumber || !whatsappPhoneNumber.waba_id) {
      console.log(`WhatsApp phone number not found for phone_number_id: ${phoneNumberId}`);
      return res.sendStatus(200);
    }

    const { access_token } = whatsappPhoneNumber.waba_id;

    const {
      content,
      mediaId,
      fileType,
      mimeType,
      interactiveId,
      interactiveData,
      replyMessageId,
      reactionMessageId,
      reactionEmoji
    } = parseIncomingMessage(message);

    let mediaUrl = null;
    let storedPath = null;

    if (mediaId) {
      mediaUrl = await getWhatsAppMediaUrl(mediaId, access_token);

      storedPath = await downloadAndStoreMedia(
        mediaUrl,
        access_token,
        mimeType,
        fileType
      );
    }

    const contact = await import('../models/index.js');
    const Contact = contact.Contact;
    let contactDoc = await Contact.findOne({
      phone_number: message.from,
      created_by: whatsappPhoneNumber.user_id
    });

    if (!contactDoc) {
      contactDoc = await Contact.create({
        phone_number: message.from,
        name: message.from,
        source: 'whatsapp',
        user_id: whatsappPhoneNumber.user_id,
        created_by: whatsappPhoneNumber.user_id,
        status: 'lead'
      });
    }

    const messageDoc = await Message.create({
      sender_number: message.from,
      recipient_number: whatsappPhoneNumber.display_phone_number,
      message_type: message.type,
      content,
      wa_message_id: message.id,
      wa_media_id: mediaId,
      file_url: storedPath,
      file_type: fileType,
      from_me: false,
      direction: "inbound",
      wa_timestamp: new Date(Number(message.timestamp) * 1000),
      metadata: message,
      user_id: whatsappPhoneNumber.user_id,
      contact_id: contactDoc._id,
      interactive_data: interactiveData,
      provider: 'business_api',
      reply_message_id: replyMessageId,
      reaction_message_id: reactionMessageId
    });

    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      try {
        const { default: metaFlowService } = await import('../services/whatsapp/meta-flow.service.js');
        const submission = await metaFlowService.handleFlowSubmission(message, whatsappPhoneNumber, contactDoc);
        if (submission?._id) {
          messageDoc.submission_id = submission._id;
          await messageDoc.save();
          console.log(`[Webhook] Linked submission ${submission._id} to message ${messageDoc._id}`);
        }
      } catch (err) {
        console.error("Error processing meta-flow submission:", err);
      }
    }

    try {
      const notificationContent = content || (fileType ? `Received ${fileType}` : 'New message');
      const senderName = contactDoc.name || message.from;
      const user = await User.findById(whatsappPhoneNumber.user_id)
        .select('player_id')
        .lean();


      await sendPushNotification({
        userIds: user.player_id,
        heading: `New message from ${senderName}`,
        content: notificationContent.length > 100 ? notificationContent.substring(0, 97) + '...' : notificationContent,
        data: {
          contact_id: contactDoc._id.toString(),
          wa_message_id: message.id,
          sender_number: message.from,
          type: 'incoming_message'
        }
      });
    } catch (pushError) {
      console.error('Error sending push notification:', pushError);
    }

    if (message.order) {
      try {
        const order = message.order;

        const items = Array.isArray(order.product_items)
          ? order.product_items.map((item) => ({
            product_retailer_id: item.product_retailer_id || item.retailer_id || null,
            quantity: Number(item.quantity) || 1,
            price: item.item_price ? Number(item.item_price) : null,
            name: item.name || null,
            raw: item
          }))
          : [];

        const totalPrice = items.reduce(
          (sum, it) => (it.price && it.quantity ? sum + it.price * it.quantity : sum),
          0
        );

        const createdOrder = await EcommerceOrder.create({
          user_id: whatsappPhoneNumber.user_id,
          phone_no_id: whatsappPhoneNumber._id,
          contact_id: contactDoc._id,
          wa_message_id: message.id,
          wa_order_id: order.id || null,
          currency: order.currency || null,
          total_price: Number.isFinite(totalPrice) ? totalPrice : null,
          items,
          raw_payload: message
        });

        try {
          await automationEngine.triggerEvent("order_received", {
            order_id: createdOrder._id?.toString(),
            wa_order_id: createdOrder.wa_order_id,
            wa_message_id: createdOrder.wa_message_id,
            total_price: createdOrder.total_price,
            currency: createdOrder.currency,
            items_count: Array.isArray(createdOrder.items) ? createdOrder.items.length : 0,
            senderNumber: message.from,
            recipientNumber: whatsappPhoneNumber.display_phone_number,
            userId: whatsappPhoneNumber.user_id.toString(),
            whatsappPhoneNumberId: whatsappPhoneNumber._id.toString(),
            contactId: contactDoc._id.toString(),
            timestamp: new Date(Number(message.timestamp) * 1000)
          });
        } catch (automationOrderError) {
          console.error('Error triggering order_received automation:', automationOrderError);
        }
      } catch (orderError) {
        console.error('Error saving WhatsApp order:', orderError);
      }
    }

    if (io) {
      const populatedMessage = await Message.findById(messageDoc._id)
        .populate({
          path: 'template_id',
          select: 'template_name language category status message_body body_variables header footer_text buttons meta_template_id'
        })
        .lean();

      const senderNumber = populatedMessage.sender_number;
      const recipientNumber = populatedMessage.recipient_number;

      const formattedMessage = {
        id: populatedMessage._id.toString(),
        content: populatedMessage.content,
        interactiveData: populatedMessage.interactive_data,
        messageType: populatedMessage.message_type,
        fileUrl: populatedMessage.file_url || null,
        template: populatedMessage.template_id || null,
        createdAt: populatedMessage.wa_timestamp,
        can_chat: true,
        delivered_at: populatedMessage.delivered_at || null,
        delivery_status: populatedMessage.delivery_status || 'pending',
        is_delivered: populatedMessage.is_delivered || false,
        is_seen: populatedMessage.is_seen || false,
        seen_at: populatedMessage.seen_at || null,
        wa_status: populatedMessage.wa_status || null,
        wa_message_id: populatedMessage.wa_message_id || null,
        direction: populatedMessage.direction || null,
        reply_message_id: populatedMessage.reply_message_id || null,
        reaction_message_id: populatedMessage.reaction_message_id || null,
        sender: {
          id: senderNumber,
          name: senderNumber
        },
        recipient: {
          id: recipientNumber,
          name: recipientNumber
        },
        submission_id: messageDoc.submission_id || null
      };

      if (formattedMessage.reply_message_id) {
        const replyMsg = await Message.findOne({ wa_message_id: formattedMessage.reply_message_id }).lean();
        if (replyMsg) {
          formattedMessage.reply_message = {
            id: replyMsg._id.toString(),
            content: replyMsg.content,
            interactiveData: replyMsg.interactive_data,
            messageType: replyMsg.message_type,
            fileUrl: replyMsg.file_url || null,
            template: replyMsg.template_id || null,
            createdAt: replyMsg.wa_timestamp,
            wa_message_id: replyMsg.wa_message_id || null,
            direction: replyMsg.direction || null,
            sender: {
              id: replyMsg.sender_number,
              name: replyMsg.sender_number
            }
          };
        }
      }

      console.log("formattedMessage", formattedMessage);
      io.emit('whatsapp:message', formattedMessage);
    }

    try {
      const automationMessage =
        message.type === "interactive" && interactiveId
          ? interactiveId
          : content;

      await automationEngine.triggerEvent("message_received", {
        message: automationMessage,
        interactive_id: interactiveId,
        senderNumber: message.from,
        recipientNumber: whatsappPhoneNumber.display_phone_number,
        messageType: message.type,
        userId: whatsappPhoneNumber.user_id.toString(),
        whatsappPhoneNumberId: whatsappPhoneNumber._id.toString(),
        waMessageId: message.id,
        waJid: message.from,
        contactId: contactDoc?._id?.toString(),
        timestamp: new Date(Number(message.timestamp) * 1000),
      });

    } catch (automationError) {
      console.error('Error triggering automation:', automationError);
    }

    try {
      const wabaId = whatsappPhoneNumber.waba_id._id || whatsappPhoneNumber.waba_id;
      const config = await WabaConfiguration.findOne({ waba_id: wabaId });

      contactDoc.last_incoming_message_at = new Date();
      if (!contactDoc.user_id) {
        contactDoc.user_id = whatsappPhoneNumber.user_id;
      }
      await contactDoc.save();

      let automatedHandled = false;

      const open = await isWithinWorkingHours(wabaId);
      if (!open && config?.out_of_working_hours?.id) {
        await sendAutomatedReply({
          wabaId,
          contactId: contactDoc._id,
          replyType: config.out_of_working_hours.type,
          replyId: config.out_of_working_hours.id,
          senderNumber: message.from,
          incomingText: content,
          userId: whatsappPhoneNumber.user_id,
          whatsappPhoneNumberId: whatsappPhoneNumber._id
        });
        automatedHandled = true;
      }

      if (!automatedHandled) {
        const matchingBot = await findMatchingBot(wabaId, content);
        console.log("matchingBot", matchingBot);
        if (matchingBot) {
          await sendAutomatedReply({
            wabaId,
            contactId: contactDoc._id,
            replyType: matchingBot.reply_type,
            replyId: matchingBot.reply_id,
            senderNumber: message.from,
            incomingText: content,
            userId: whatsappPhoneNumber.user_id,
            whatsappPhoneNumberId: whatsappPhoneNumber._id
          });
          automatedHandled = true;
        }
      }


      const isNewContact = (Date.now() - new Date(contactDoc.created_at).getTime() < 10000);

      if (!automatedHandled && isNewContact) {
        if (config?.welcome_message?.id) {
          await sendAutomatedReply({
            wabaId,
            contactId: contactDoc._id,
            replyType: config.welcome_message.type,
            replyId: config.welcome_message.id,
            senderNumber: message.from,
            incomingText: content,
            userId: whatsappPhoneNumber.user_id,
            whatsappPhoneNumberId: whatsappPhoneNumber._id
          });
          automatedHandled = true;
        }

        if (config?.round_robin_assignment) {
          await assignRoundRobin(whatsappPhoneNumber.user_id, contactDoc._id, whatsappPhoneNumber._id);
        }
      }
      console.log("!automatedHandled && config?.fallback_message?.id", !automatedHandled && config?.fallback_message?.id);
      if (!automatedHandled && config?.fallback_message?.id) {
        await sendAutomatedReply({
          wabaId,
          contactId: contactDoc._id,
          replyType: config.fallback_message.type,
          replyId: config.fallback_message.id,
          senderNumber: message.from,
          incomingText: content,
          userId: whatsappPhoneNumber.user_id,
          whatsappPhoneNumberId: whatsappPhoneNumber._id
        });
      }

    } catch (autoErr) {
      console.error('Error in advanced automated handling:', autoErr);
    }

    if (value?.calls) {
      try {
        const callEvent = value.calls[0];
        const phoneNumberId = value.metadata?.phone_number_id;

        console.log('[CallWebhook] Received call event:', callEvent.event, callEvent.id);

        const callAutomationService = (await import('../services/whatsapp/call-automation.service.js')).default;

        if (callEvent.event === 'connect' && callEvent.session?.sdp_type === 'answer') {
          const callbackData = JSON.parse(callEvent.biz_opaque_callback_data || '{}');

          if (callbackData.is_outbound) {
            console.log('[CallWebhook] Handling outbound call connection:', callEvent.id);
            await callAutomationService.handleOutboundCallConnected(
              callEvent.id,
              callEvent.session,
              callbackData,
              phoneNumberId
            );
          }
        }

        if (callEvent.event === 'terminate') {
          console.log('[CallWebhook] Handling call termination:', callEvent.id);
          await callAutomationService.handleOutboundCallTerminated(
            callEvent.id,
            callEvent.duration,
            callEvent.reason
          );
        }
      } catch (callError) {
        console.error('[CallWebhook] Error handling call event:', callError);
      }
    }

    if (message.type === 'interactive' && message.interactive?.call_permission_reply) {
      try {
        const permissionResponse = message.interactive.call_permission_reply;
        const Contact = (await import('../models/index.js')).Contact;

        if (permissionResponse.response === 'accept') {
          await Contact.findOneAndUpdate(
            { phone_number: message.from },
            {
              call_permission_status: 'granted',
              call_permission_type: permissionResponse.is_permanent ? 'permanent' : 'temporary',
              call_permission_updated_at: new Date()
            }
          );

          const { handleCallPermissionGranted } = await import('../utils/whatsapp-message-handler.js');
          await handleCallPermissionGranted(
            message.from,
            value.metadata.phone_number_id,
            entry.id
          );
        } else if (permissionResponse.response === 'reject') {
          await Contact.findOneAndUpdate(
            { phone_number: message.from },
            {
              call_permission_status: 'denied',
              call_permission_updated_at: new Date()
            }
          );
        }
      } catch (permissionError) {
        console.error('Error handling call permission response:', permissionError);
      }
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    res.sendStatus(200);
  }
};


export const handleStatusUpdate = async (req, res, io = null) => {
  try {
    console.log("WhatsApp status webhook called");

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.statuses) {
      return res.sendStatus(200);
    }

    const status = value.statuses[0];
    console.log("sttatuss", value.statuses[0].errors);
    const waMessageId = status.id;
    const statusType = status.status;
    const timestamp = new Date(Number(status.timestamp) * 1000);

    console.log(`Processing status update for message ${waMessageId}: ${statusType}`);

    try {
      const updatedMessage = await updateWhatsAppStatus(waMessageId, statusType, timestamp);

      if (io && updatedMessage) {
        const populatedMessage = await Message.findById(updatedMessage._id)
          .populate({
            path: 'template_id',
            select: 'template_name language category status message_body body_variables header footer_text buttons meta_template_id'
          })
          .lean();

        const senderNumber = populatedMessage.sender_number;
        const recipientNumber = populatedMessage.recipient_number;

        const formattedMessage = {
          id: populatedMessage._id.toString(),
          content: populatedMessage.content,
          interactiveData: populatedMessage.interactive_data,
          messageType: populatedMessage.message_type,
          fileUrl: populatedMessage.file_url || null,
          template: populatedMessage.template_id || null,
          createdAt: populatedMessage.wa_timestamp,
          can_chat: true,
          delivered_at: populatedMessage.delivered_at || null,
          delivery_status: populatedMessage.delivery_status || 'pending',
          is_delivered: populatedMessage.is_delivered || false,
          is_seen: populatedMessage.is_seen || false,
          seen_at: populatedMessage.seen_at || null,
          wa_status: populatedMessage.wa_status || null,
          direction: populatedMessage.direction || null,
          sender: {
            id: senderNumber,
            name: senderNumber
          },
          recipient: {
            id: recipientNumber,
            name: recipientNumber
          }
        };

        console.log("formattedMessage", formattedMessage);
        io.emit('whatsapp:status', formattedMessage);
      }

      try {
        const { updateCampaignStatsFromWhatsApp } = await import('../utils/campaign-stats.service.js');
        const result = await updateCampaignStatsFromWhatsApp(waMessageId, statusType, timestamp);
        console.log(`Campaign stats update result for ${waMessageId}:`, result);
      } catch (campaignError) {
        console.error(`Error updating campaign stats for message ${waMessageId}:`, campaignError);
      }

      if (updatedMessage) {
        await automationEngine.triggerEvent("status_update", {
          waMessageId: waMessageId,
          status: statusType,
          timestamp: timestamp,
          recipientId: status.recipient_id,
          messageId: updatedMessage._id.toString(),
          userId: updatedMessage.user_id?.toString()
        });

        console.log(`Status updated successfully for message ${waMessageId}`);
      } else {
        console.log(`Status update processed for call: ${waMessageId}`);
      }

    } catch (updateError) {
      console.error(`Error updating status for message ${waMessageId}:`, updateError);
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("WhatsApp status webhook error:", error);
    res.sendStatus(200);
  }
};

