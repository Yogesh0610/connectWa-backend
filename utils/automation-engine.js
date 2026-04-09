import {
  AutomationFlow,
  AutomationExecution,
  Contact,
  EcommerceOrder,
  Message,
  WhatsappPhoneNumber,
  FlowSession,
} from "../models/index.js";
import unifiedWhatsAppService from "../services/whatsapp/unified-whatsapp.service.js";
import { PROVIDER_TYPES } from "../services/whatsapp/unified-whatsapp.service.js";
import automationCache from "./automation-cache.js";
import { v4 as uuidv4 } from "uuid";

class AutomationEngine {
  constructor() {
    this.runningExecutions = new Map();
    this.eventListeners = new Map();
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    this.eventListeners.set(
      "message_received",
      this.handleMessageReceived.bind(this),
    );

    this.eventListeners.set(
      "contact_joined",
      this.handleContactJoined.bind(this),
    );
    this.eventListeners.set(
      "status_update",
      this.handleStatusUpdate.bind(this),
    );
    this.eventListeners.set(
      "order_received",
      this.handleOrderReceived.bind(this),
    );

    console.log(
      "Automation engine event listeners initialized:",
      Array.from(this.eventListeners.keys()),
    );
  }

  async handleOrderReceived(eventData) {
    try {
      console.log("=====================handleOrderReceived called", eventData);
      const { userId } = eventData;

      let contact = null;
      try {
        if (eventData.contactId) {
          contact = await Contact.findOne({
            _id: eventData.contactId,
            created_by: userId,
            deleted_at: null,
          }).lean();
        }
      } catch (contactErr) {
        console.warn(
          "Failed to load contact for order_received:",
          contactErr.message,
        );
      }

      const triggers = await automationCache.getUserActiveFlows(userId);
      console.log(`Found ${triggers.length} triggers for user ${userId}`);

      const orderTriggers = triggers.filter(
        (t) => t.event_type === "order_received",
      );
      console.log(`Found ${orderTriggers.length} order received triggers`);

      for (const trigger of orderTriggers) {
        let flow = automationCache.getFlow(trigger.flow_id.toString());
        if (!flow) {
          flow = await AutomationFlow.findById(trigger.flow_id).populate(
            "user_id",
          );
          if (flow) {
            automationCache.setFlow(trigger.flow_id.toString(), flow);
            console.log(`Loaded flow from DB and cached: ${trigger.flow_id}`);
          }
        }

        if (flow && flow.is_active && !flow.deleted_at) {
          const shouldExecute = this.checkOrderTriggerConditions(
            flow,
            eventData,
          );
          console.log(`Should execute order flow: ${shouldExecute}`);
          if (shouldExecute) {
            await this.executeFlow(flow, {
              event_type: "order_received",
              ...eventData,
              contact,
              timestamp: new Date(),
            });
          }
        }
      }
    } catch (error) {
      console.error("Error handling order received event:", error);
    }
  }

  checkOrderTriggerConditions(flow, eventData) {
    const triggers = flow.triggers.filter(
      (t) => t.event_type === "order_received",
    );

    const dataObject = {
      eventType: "orderReceived",
      order_id: eventData.order_id,
      wa_order_id: eventData.wa_order_id,
      wa_message_id: eventData.wa_message_id,
      total_price: eventData.total_price,
      currency: eventData.currency,
      items_count: eventData.items_count,
      senderNumber: eventData.senderNumber,
      recipientNumber: eventData.recipientNumber,
      contactId: eventData.contactId,
      userId: eventData.userId,
      whatsappPhoneNumberId: eventData.whatsappPhoneNumberId,
    };

    for (const trigger of triggers) {
      const conditions = trigger.conditions || {};
      if (Object.keys(conditions).length === 0) {
        return true;
      }

      const result = this.evaluateCondition(conditions, dataObject);
      if (result) return true;
    }

    return false;
  }

  async handleMessageReceived(eventData) {
    try {
      console.log(
        "=====================handleMessageReceived called",
        eventData,
      );
      const { message, senderNumber, recipientNumber, userId, messageType } =
        eventData;

      // ── Check for active flow session (user_input waiting for reply) ──────────
      try {
        const activeSession = await FlowSession.findOne({
          sender_number: senderNumber,
          user_id: userId,
          status: "waiting",
          expires_at: { $gt: new Date() },
        })
          .sort({ created_at: -1 })
          .lean();

        if (activeSession) {
          console.log(
            `Resuming flow session ${activeSession._id} for sender ${senderNumber}`,
          );
          await this.resumeFlowFromSession(
            activeSession,
            message || "",
            eventData,
          );
          return; // Don't trigger a new flow
        }
      } catch (sessionErr) {
        console.warn("Failed to check flow sessions:", sessionErr.message);
      }

      let contact = null;
      try {
        if (eventData.contactId) {
          contact = await Contact.findOne({
            _id: eventData.contactId,
            created_by: userId,
            deleted_at: null,
          }).lean();
        } else if (senderNumber) {
          contact = await Contact.findOne({
            phone_number: senderNumber,
            created_by: userId,
            deleted_at: null,
          }).lean();
        }
      } catch (contactErr) {
        console.warn(
          "Failed to load contact for message_received:",
          contactErr.message,
        );
      }

      const triggers = await automationCache.getUserActiveFlows(userId);
      console.log(`Found ${triggers.length} triggers for user ${userId}`);

      const messageTriggers = triggers.filter(
        (t, i, arr) =>
          t.event_type === "message_received" &&
          arr.findIndex(
            (tt) =>
              String(tt.flow_id) === String(t.flow_id) &&
              tt.event_type === "message_received",
          ) === i,
      );
      console.log(`Found ${messageTriggers.length} message received triggers`);

      for (const trigger of messageTriggers) {
        console.log(`Processing trigger:`, trigger);
        let flow = automationCache.getFlow(trigger.flow_id.toString());
        if (!flow) {
          flow = await AutomationFlow.findById(trigger.flow_id).populate(
            "user_id",
          );
          if (flow) {
            automationCache.setFlow(trigger.flow_id.toString(), flow);
            console.log(`Loaded flow from DB and cached: ${trigger.flow_id}`);
          }
        }

        if (flow && flow.is_active && !flow.deleted_at) {
          console.log(`Checking conditions for flow:`, flow.name);
          const shouldExecute = this.checkMessageTriggerConditions(
            flow,
            message,
            senderNumber,
            recipientNumber,
            messageType,
            null,
            eventData,
          );
          console.log(`Should execute flow: ${shouldExecute}`);
          if (shouldExecute) {
            console.log(`Executing flow: ${flow.name} for message: ${message}`);
            await this.executeFlow(flow, {
              event_type: "message_received",
              message,
              senderNumber,
              recipientNumber,
              userId,
              messageType,
              contactId:
                eventData.contactId || contact?._id?.toString() || null,
              contact,
              whatsappPhoneNumberId: eventData.whatsappPhoneNumberId,
              timestamp: new Date(),
            });
            break;
          } else {
            console.log(`Flow conditions not met for: ${flow.name}`);
          }
        } else {
          console.log(`Flow not active or deleted:`, flow?.name);
        }
      }
    } catch (error) {
      console.error("Error handling message received event:", error);
    }
  }

  checkMessageTriggerConditions(
    flow,
    message,
    senderNumber,
    recipientNumber,
    messageType,
    messageId,
    eventData = null,
  ) {
    console.log(`Checking conditions for flow: ${flow.name}`, {
      message,
      senderNumber,
      recipientNumber,
      messageType,
    });
    const triggers = flow.triggers.filter(
      (t) => t.event_type === "message_received",
    );
    console.log(`Found ${triggers.length} message received triggers in flow`);

    const dataObject = {
      message: message || messageId,
      senderNumber,
      recipientNumber,
      messageType,
      eventType: "messageReceived",
    };

    if (eventData && eventData.whatsappPhoneNumberId) {
      dataObject.whatsappPhoneNumberId = eventData.whatsappPhoneNumberId;
    }

    for (const trigger of triggers) {
      const conditions = trigger.conditions || {};
      console.log(`Checking conditions:`, conditions);

      if (Object.keys(conditions).length === 0) {
        console.log(
          "No conditions specified, triggering flow for all messages",
        );
        return true;
      }

      const result = this.evaluateCondition(conditions, dataObject);

      console.log(`Condition evaluation result: ${result}`);
      if (result) {
        console.log(`All conditions met for flow: ${flow.name}`);
        return true;
      }
    }

    console.log(`No matching triggers found for flow: ${flow.name}`);
    return false;
  }

  async handleContactJoined(eventData) {
    console.log("Contact joined event:", eventData);
  }

  async handleStatusUpdate(eventData) {
    console.log("Status update event:", eventData);
  }

  async executeFlow(flow, inputData) {
    const executionId = uuidv4();
    try {
      const execution = await AutomationExecution.create({
        flow_id: flow._id,
        user_id: flow.user_id._id || flow.user_id,
        status: "running",
        input_data: inputData,
      });

      this.runningExecutions.set(executionId, execution._id);

      const result = await this.processWorkflow(flow, execution, inputData);

      await AutomationExecution.findByIdAndUpdate(execution._id, {
        status: result.success ? "success" : "failed",
        output_data: result.output,
        execution_time: result.executionTime,
        completed_at: new Date(),
        execution_log: result.executionLog,
      });

      await this.updateFlowStatistics(flow._id, result.success);

      this.runningExecutions.delete(executionId);
      return result;
    } catch (error) {
      console.error("Error executing automation flow:", error);

      if (executionId) {
        await AutomationExecution.findByIdAndUpdate(
          this.runningExecutions.get(executionId),
          {
            status: "failed",
            error: error.message,
            completed_at: new Date(),
          },
        );
        this.runningExecutions.delete(executionId);
      }

      throw error;
    }
  }

  async processWorkflow(flow, execution, inputData) {
    const startTime = Date.now();
    const executionLog = [];
    let currentData = { ...inputData };

    const startNodes = this.getStartNodes(flow);
    for (const node of startNodes) {
      const nodeResult = await this.executeNode(
        node,
        flow,
        currentData,
        executionLog,
      );
      if (nodeResult.success) {
        currentData = {
          ...currentData,
          ...nodeResult.output,
          userId: currentData.userId || inputData.userId || inputData.user_id,
        };

        await this.processConnectedNodes(
          flow,
          node,
          currentData,
          executionLog,
          inputData,
        );
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      output: currentData,
      executionTime,
      executionLog,
    };
  }

  getStartNodes(flow) {
    const connectedTargets = new Set();
    flow.connections.forEach((conn) => {
      connectedTargets.add(conn.target);
    });

    return flow.nodes.filter(
      (node) => !connectedTargets.has(node.id) && node.type === "trigger",
    );
  }

  async processConnectedNodes(
    flow,
    currentNode,
    currentData,
    executionLog,
    originalInputData = {},
    visited = new Set(),
  ) {
    // Cycle protection: skip nodes we've already visited in this execution path
    if (visited.has(currentNode.id)) {
      console.warn(
        `Cycle detected at node ${currentNode.id} — stopping recursion`,
      );
      return;
    }
    const newVisited = new Set(visited);
    newVisited.add(currentNode.id);

    const connectedNodes = this.getConnectedNodes(flow, currentNode.id);

    for (const node of connectedNodes) {
      const nodeResult = await this.executeNode(
        node,
        flow,
        currentData,
        executionLog,
      );

      // user_input / button / list node is pausing — save session state and stop recursion
      if (nodeResult.waitForInput) {
        await this.saveFlowSession(
          flow,
          node,
          { ...currentData, ...nodeResult.output },
          nodeResult.variableName,
        );
        return;
      }

      // end_flow node — stop the entire chain
      if (nodeResult.output?.flowEnded) {
        return;
      }

      const updatedData = {
        ...currentData,
        ...nodeResult.output,
        userId:
          currentData.userId ||
          originalInputData.userId ||
          originalInputData.user_id,
      };

      if (node.type === "condition") {
        // Condition branching: true path uses src-true or src (button/list conditions)
        // false path uses src-false (regular conditions only)
        const branchNodes = nodeResult.success
          ? [
              ...this.getConnectedNodesByHandle(flow, node.id, "src-true"),
              ...this.getConnectedNodesByHandle(flow, node.id, "src"),
            ]
          : this.getConnectedNodesByHandle(flow, node.id, "src-false");

        for (const branchNode of branchNodes) {
          if (newVisited.has(branchNode.id)) continue;
          // Execute the branch target node directly (not just its children)
          const branchResult = await this.executeNode(
            branchNode,
            flow,
            updatedData,
            executionLog,
          );

          if (branchResult.waitForInput) {
            await this.saveFlowSession(
              flow,
              branchNode,
              { ...updatedData, ...branchResult.output },
              branchResult.variableName,
            );
            return;
          }
          if (branchResult.output?.flowEnded) return;

          if (branchResult.success) {
            const branchUpdated = {
              ...updatedData,
              ...branchResult.output,
              userId:
                updatedData.userId ||
                originalInputData.userId ||
                originalInputData.user_id,
            };
            await this.processConnectedNodes(
              flow,
              branchNode,
              branchUpdated,
              executionLog,
              originalInputData,
              newVisited,
            );
          }
        }
      } else if (nodeResult.success) {
        await this.processConnectedNodes(
          flow,
          node,
          updatedData,
          executionLog,
          originalInputData,
          newVisited,
        );
      }
    }
  }

  getConnectedNodes(flow, nodeId) {
    const connectedIds = flow.connections
      .filter((conn) => conn.source === nodeId)
      .map((conn) => conn.target);

    return flow.nodes.filter((node) => connectedIds.includes(node.id));
  }

  getConnectedNodesByHandle(flow, nodeId, sourceHandle) {
    const connectedIds = flow.connections
      .filter(
        (conn) => conn.source === nodeId && conn.sourceHandle === sourceHandle,
      )
      .map((conn) => conn.target);

    return flow.nodes.filter((node) => connectedIds.includes(node.id));
  }

  async executeNode(node, flow, inputData, executionLog) {
    const startTime = Date.now();
    let result = { success: false, output: {} };

    try {
      const nodeLog = {
        node_id: node.id,
        node_type: node.type,
        status: "running",
        start_time: new Date(),
        input: inputData,
      };

      switch (node.type) {
        case "trigger":
          result = await this.executeTriggerNode(node, inputData);
          break;
        case "condition":
          result = await this.executeConditionNode(node, inputData);
          break;
        case "action":
          result = await this.executeActionNode(node, inputData);
          break;
        case "delay":
          result = await this.executeDelayNode(node, inputData);
          break;
        case "filter":
          result = await this.executeFilterNode(node, inputData);
          break;
        case "transform":
          result = await this.executeTransformNode(node, inputData);
          break;
        case "webhook":
          result = await this.executeWebhookNode(node, inputData);
          break;
        case "ai_response":
          result = await this.executeAIResponseNode(node, inputData);
          break;
        case "send_message":
          result = await this.executeSendMessageNode(node, inputData);
          break;
        case "wa_template":
        case "send_wa_template":
          result = await this.executeSendMessageNode(node, inputData);
          break;
        case "add_tag":
          result = await this.executeAddTagNode(node, inputData);
          break;
        case "update_contact":
          result = await this.executeUpdateContactNode(node, inputData);
          break;
        case "user_input":
          result = await this.executeUserInputNode(node, inputData);
          break;
        case "set_variable":
          result = await this.executeSetVariableNode(node, inputData);
          break;
        case "api_webhook":
        case "webhook":
          result = await this.executeWebhookNode(node, inputData);
          break;
        case "jump_to_flow":
          result = await this.executeJumpToFlowNode(node, inputData);
          break;
        case "end_flow":
          result = await this.executeEndFlowNode(node, inputData);
          break;
        case "disable_auto_reply":
          result = await this.executeDisableAutoReplyNode(node, inputData);
          break;
        case "reset_session":
          result = await this.executeResetSessionNode(node, inputData);
          break;
        case "send_email":
          result = await this.executeSendEmailNode(node, inputData);
          break;
        case "google_sheets":
          result = await this.executeGoogleSheetsNode(node, inputData);
          break;
        case "mysql_query":
          result = await this.executeMysqlQueryNode(node, inputData);
          break;
        case "agent_transfer":
          result = await this.executeAgentTransferNode(node, inputData);
          break;
        case "ai_transfer":
          result = await this.executeAiTransferNode(node, inputData);
          break;
        case "interactive_message":
        case "template_message":
        case "text_message":
        case "button_message":
        case "list_message":
        case "list-message":
        case "media_message":
        case "location":
        case "call_to_action":
        case "send-message":
          result = await this.executeSendMessageNode(node, inputData);
          break;
        case "custom":
          result = await this.executeCustomNode(node, inputData);
          break;
        default:
          // Unknown types: log and continue so the flow doesn't crash
          result = { success: true, output: inputData };
      }

      nodeLog.status = result.success ? "success" : "failed";
      nodeLog.output = result.output;
      nodeLog.end_time = new Date();
      nodeLog.error = result.error || null;

      executionLog.push(nodeLog);

      return result;
    } catch (error) {
      const nodeLog = {
        node_id: node.id,
        node_type: node.type,
        status: "failed",
        start_time: new Date(),
        end_time: new Date(),
        input: inputData,
        output: {},
        error: error.message,
      };
      executionLog.push(nodeLog);

      return { success: false, output: {}, error: error.message };
    }
  }

  async executeTriggerNode(node, inputData) {
    return { success: true, output: inputData };
  }

  async executeConditionNode(node, inputData) {
    const { condition } = node.parameters || {};
    if (!condition) {
      return { success: true, output: inputData };
    }

    try {
      const result = this.evaluateCondition(condition, inputData);
      return {
        success: result,
        output: { ...inputData, conditionResult: result },
      };
    } catch (error) {
      return { success: false, output: {}, error: error.message };
    }
  }

  evaluateCondition(condition, data) {
    const { field, operator, value } = condition;

    if (!field || !operator || value === undefined) {
      return true;
    }

    const fieldValue = this.getNestedValue(data, field);

    switch (operator) {
      case "equals":
        return fieldValue == value;
      case "not_equals":
        return fieldValue != value;
      case "contains":
        return String(fieldValue).includes(String(value));
      case "not_contains":
        return !String(fieldValue).includes(String(value));
      case "starts_with":
        return String(fieldValue).startsWith(String(value));
      case "ends_with":
        return String(fieldValue).endsWith(String(value));
      case "greater_than":
        return Number(fieldValue) > Number(value);
      case "less_than":
        return Number(fieldValue) < Number(value);
      case "greater_than_or_equal":
        return Number(fieldValue) >= Number(value);
      case "less_than_or_equal":
        return Number(fieldValue) <= Number(value);
      case "is_empty":
        return !fieldValue || fieldValue === "";
      case "is_not_empty":
        return !!fieldValue && fieldValue !== "";
      case "contains_any":
        if (!Array.isArray(value)) {
          return false;
        }
        return value.some((v) =>
          String(fieldValue).toLowerCase().includes(String(v).toLowerCase()),
        );
      default:
        return true;
    }
  }

  getNestedValue(obj, path) {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  async executeActionNode(node, inputData) {
    const { action_type, parameters } = node.parameters || {};

    switch (action_type) {
      case "log":
        console.log(
          "Automation log:",
          parameters?.message || "Action executed",
          inputData,
        );
        break;
      case "set_variable":
        const { variable_name, variable_value } = parameters || {};
        if (variable_name) {
          inputData[variable_name] = variable_value;
        }
        break;
      default:
        break;
    }

    return { success: true, output: inputData };
  }

  async executeDelayNode(node, inputData) {
    const { delay_ms } = node.parameters || { delay_ms: 1000 };

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, output: inputData });
      }, delay_ms);
    });
  }

  async executeFilterNode(node, inputData) {
    const { filter_condition } = node.parameters || {};

    if (!filter_condition) {
      return { success: true, output: inputData };
    }

    const shouldPass = this.evaluateCondition(filter_condition, inputData);
    return { success: shouldPass, output: shouldPass ? inputData : {} };
  }

  async executeTransformNode(node, inputData) {
    const { transform_type, mapping } = node.parameters || {};

    let output = { ...inputData };

    if (transform_type === "field_mapping" && mapping) {
      for (const [targetField, sourceField] of Object.entries(mapping)) {
        output[targetField] = this.getNestedValue(inputData, sourceField);
      }
    }

    return { success: true, output };
  }

  async executeWebhookNode(node, inputData) {
    const { url, method, headers, body } = node.parameters || {};

    console.log(
      `[WebhookNode] node.parameters:`,
      JSON.stringify(node.parameters, null, 2),
    );
    console.log(`[WebhookNode] URL: ${url}`);

    if (!url) {
      console.error(`[WebhookNode] ERROR: No URL configured!`);
      return {
        success: false,
        output: inputData,
        error: "Webhook URL is required",
      };
    }

    try {
      const processedUrl = this.processTemplateString(url, inputData);
      const processedHeaders = this.processHeaders(headers || {}, inputData);
      const upperMethod = (method || "POST").toUpperCase();

      console.log(`[WebhookNode] Processed URL: ${processedUrl}`);

      // GET/HEAD ke liye body nahi bhejte
      const fetchOptions = {
        method: upperMethod,
        headers: processedHeaders,
      };

      if (upperMethod !== "GET" && upperMethod !== "HEAD") {
        const processedBody = this.processTemplateString(
          JSON.stringify(body || {}),
          inputData,
        );
        fetchOptions.body = processedBody;
        console.log(`[WebhookNode] Processed Body:`, processedBody);
      }

      const response = await fetch(processedUrl, fetchOptions);

      const responseText = await response.text();
      console.log(`[WebhookNode] Response status: ${response.status}`);
      console.log(
        `[WebhookNode] Response text: ${responseText.substring(0, 500)}`,
      );

      const responseJson = this.isJsonString(responseText)
        ? JSON.parse(responseText)
        : responseText;

      // response_json_path se specific field extract karo
      const { response_json_path, response_variable } = node.parameters || {};
      let extractedValue = responseJson;
      if (response_json_path && typeof responseJson === "object") {
        extractedValue = this.getNestedValue(responseJson, response_json_path);
        console.log(
          `[WebhookNode] Extracted "${response_json_path}":`,
          extractedValue,
        );
      }

      const outputData = {
        ...inputData,
        webhook_response: responseJson,
        webhook_status: response.status,
      };

      // response_variable mein extracted value store karo
      if (response_variable) {
        outputData[response_variable] = extractedValue;
        console.log(
          `[WebhookNode] Stored in "${response_variable}":`,
          extractedValue,
        );
      }

      return { success: response.ok, output: outputData };
    } catch (error) {
      console.error(`[WebhookNode] FETCH ERROR:`, error.message);
      return { success: false, output: inputData, error: error.message };
    }
  }

  processTemplateString(template, data) {
    return template.replace(/\{\{([^{}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(data, path.trim());
      return value !== undefined ? value : match;
    });
  }

  processHeaders(headers, data) {
    const processedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      processedHeaders[key] = this.processTemplateString(value, data);
    }
    return processedHeaders;
  }

  isJsonString(str) {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  async executeAIResponseNode(node, inputData) {
    const { ai_model, prompt_template, api_key } = node.parameters || {};

    if (!ai_model || !prompt_template) {
      return {
        success: false,
        output: inputData,
        error: "AI model and prompt are required",
      };
    }

    try {
      const processedPrompt = this.processTemplateString(
        prompt_template,
        inputData,
      );

      const aiResponse = `AI response for: ${processedPrompt.substring(0, 50)}...`;

      return {
        success: true,
        output: { ...inputData, ai_response: aiResponse },
      };
    } catch (error) {
      return { success: false, output: inputData, error: error.message };
    }
  }

  async executeSendMessageNode(node, inputData) {
    const {
      recipient,
      message_template,
      media_url,
      buttons,
      interactive_type,
      button_params,
      list_params,
      cta_params,
      provider_type,
      messageType,
      location_params,
      template_name,
      language,
      variable_mappings,
      header_media_url,
    } = node.parameters || {};

    if (!recipient) {
      return {
        success: false,
        output: inputData,
        error: "Recipient is required",
      };
    }

    try {
      const userId = inputData.userId || inputData.user_id;
      if (!userId) {
        console.error("No userId found in inputData:", inputData);
        return {
          success: false,
          output: inputData,
          error: "User ID is required to send message",
        };
      }

      const processedRecipient = this.processTemplateString(
        recipient,
        inputData,
      );

      const messageParams = {
        recipientNumber: processedRecipient,
        providerType: provider_type || PROVIDER_TYPES.BUSINESS_API,
      };

      if (messageType === "template" && template_name) {
        messageParams.messageType = "template";
        messageParams.templateName = template_name;
        messageParams.languageCode = language || "en_US";
        // Convert variable_mappings array to { "1": "value", "2": "value" } object
        if (Array.isArray(variable_mappings) && variable_mappings.length > 0) {
          const vars = {};
          variable_mappings.forEach((m) => {
            if (m.component === "body" && m.value) {
              vars[String(m.index)] = this.processTemplateString(
                m.value,
                inputData,
              );
            }
          });
          if (Object.keys(vars).length > 0)
            messageParams.templateVariables = vars;
          // Build header media component if needed
          const headerMapping = variable_mappings.find(
            (m) => m.component === "header",
          );
          if (headerMapping?.value)
            messageParams.mediaUrl = headerMapping.value;
        }
        if (header_media_url) messageParams.mediaUrl = header_media_url;
      } else if (messageType === "location" && location_params) {
        messageParams.messageType = "location";
        messageParams.locationParams = {
          latitude: location_params.latitude,
          longitude: location_params.longitude,
          name: this.processTemplateString(
            location_params.name || "",
            inputData,
          ),
          address: this.processTemplateString(
            location_params.address || "",
            inputData,
          ),
        };
      } else {
        if (message_template) {
          const processedMessage = this.processTemplateString(
            message_template,
            inputData,
          );
          messageParams.messageText = processedMessage;
        }
      }

      if (media_url) {
        messageParams.mediaUrl = media_url;
        messageParams.file = {
          originalname: "media",
          mimetype: this.getMimeTypeFromUrl(media_url),
          buffer: null,
          url: media_url,
        };
      }

      if (interactive_type) {
        messageParams.messageType = "interactive";
        messageParams.interactiveType = interactive_type;

        if (interactive_type === "cta_url" && cta_params) {
          messageParams.interactiveType = "cta_url";
          messageParams.ctaParams = {
            header: cta_params.header
              ? this.processTemplateString(cta_params.header, inputData)
              : undefined,
            body: this.processTemplateString(cta_params.body || "", inputData),
            button: {
              text: cta_params.button?.text || "Click Here",
              url: this.processTemplateString(
                cta_params.button?.url || "",
                inputData,
              ),
            },
          };
        } else if (interactive_type === "button" && button_params) {
          messageParams.buttonParams = button_params.map((btn) => ({
            title: this.processTemplateString(btn.title, inputData),
            id: this.processTemplateString(btn.id, inputData),
          }));
        } else if (interactive_type === "list" && list_params) {
          messageParams.listParams = {
            header: this.processTemplateString(
              list_params.header || "",
              inputData,
            ),
            body: this.processTemplateString(
              list_params.body || message_template || "",
              inputData,
            ),
            footer: this.processTemplateString(
              list_params.footer || "",
              inputData,
            ),
            buttonTitle: this.processTemplateString(
              list_params.buttonTitle || "Select",
              inputData,
            ),
            sectionTitle: this.processTemplateString(
              list_params.sectionTitle || "Options",
              inputData,
            ),
            items: (list_params.items || []).map((item) => ({
              title: this.processTemplateString(item.title, inputData),
              description: this.processTemplateString(
                item.description || "",
                inputData,
              ),
              id: this.processTemplateString(item.id || item.title, inputData),
            })),
          };
        }
      } else if (
        buttons &&
        Array.isArray(buttons) &&
        buttons.length > 0 &&
        buttons.length <= 3
      ) {
        messageParams.buttons = buttons;
        messageParams.messageType = "interactive";
        messageParams.interactiveType = "button";
        messageParams.buttonParams = buttons.map((btn) => ({
          id: btn.id,
          title: btn.text,
        }));
      } else {
        if (messageParams.file) {
          const mime = messageParams.file.mimetype;
          if (mime.startsWith("image")) messageParams.messageType = "image";
          else if (mime.startsWith("video"))
            messageParams.messageType = "video";
          else if (mime.startsWith("audio"))
            messageParams.messageType = "audio";
          else messageParams.messageType = "document";
        } else if (!messageParams.messageType) {
          messageParams.messageType = "text";
        }
      }

      if (inputData.whatsappPhoneNumberId) {
        const whatsappPhoneNumber = await WhatsappPhoneNumber.findById(
          inputData.whatsappPhoneNumberId,
        )
          .populate("waba_id")
          .lean();

        if (whatsappPhoneNumber && whatsappPhoneNumber.waba_id) {
          messageParams.whatsappPhoneNumber = whatsappPhoneNumber;
        }
      } else if (inputData.whatsappConnectionId) {
        messageParams.connectionId = inputData.whatsappConnectionId;
      }

      const result = await unifiedWhatsAppService.sendMessage(
        userId,
        messageParams,
      );

      const baseOutput = {
        ...inputData,
        message_sent: true,
        sent_to: processedRecipient,
        provider: result.provider,
        message_id: result.messageId,
      };

      // Button and list interactive messages PAUSE the flow.
      // The flow resumes when the user's button click / list selection arrives,
      // and the condition nodes after this node evaluate which branch to take.
      if (interactive_type === "button" || interactive_type === "list") {
        return {
          success: true,
          waitForInput: true,
          variableName: null,
          output: baseOutput,
        };
      }

      return { success: true, output: baseOutput };
    } catch (error) {
      return { success: false, output: inputData, error: error.message };
    }
  }

  getMimeTypeFromUrl(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg"))
      return "image/jpeg";
    if (lowerUrl.includes(".png")) return "image/png";
    if (lowerUrl.includes(".mp4")) return "video/mp4";
    if (lowerUrl.includes(".mp3")) return "audio/mp3";
    if (lowerUrl.includes(".pdf")) return "application/pdf";
    return "application/octet-stream";
  }

  async executeAddTagNode(node, inputData) {
    const { tag_name } = node.parameters || {};

    if (!tag_name) {
      return {
        success: false,
        output: inputData,
        error: "Tag name is required",
      };
    }

    return {
      success: true,
      output: { ...inputData, tag_added: tag_name },
    };
  }

  async executeUpdateContactNode(node, inputData) {
    const { updates } = node.parameters || {};

    const userId = inputData.userId || inputData.user_id;
    const contactId = inputData.contactId || inputData.contact?._id;

    if (!userId) {
      return {
        success: false,
        output: inputData,
        error: "User ID is required to update contact",
      };
    }
    if (!contactId) {
      return {
        success: false,
        output: inputData,
        error: "contactId is required to update contact",
      };
    }

    const resolvedUpdates = {};
    for (const [key, value] of Object.entries(updates || {})) {
      if (typeof value === "string") {
        resolvedUpdates[key] = this.processTemplateString(value, inputData);
      } else {
        resolvedUpdates[key] = value;
      }
    }

    try {
      await Contact.updateOne(
        { _id: contactId, created_by: userId, deleted_at: null },
        { $set: resolvedUpdates },
      );

      const updatedContact = await Contact.findOne({
        _id: contactId,
        created_by: userId,
        deleted_at: null,
      }).lean();

      return {
        success: true,
        output: {
          ...inputData,
          contact: updatedContact,
          contactId: updatedContact?._id?.toString() || contactId,
          contact_updated: resolvedUpdates,
        },
      };
    } catch (err) {
      return { success: false, output: inputData, error: err.message };
    }
  }

  async executeCustomNode(node, inputData) {
    const { custom_logic, parameters } = node.parameters || {};

    console.log("Executing custom node:", custom_logic);

    if (custom_logic === "update_order_status") {
      const userId = inputData.userId || inputData.user_id;
      const orderId = this.processTemplateString(
        parameters?.order_id || "",
        inputData,
      );
      const status = parameters?.status;

      if (!userId) {
        return {
          success: false,
          output: inputData,
          error: "User ID is required to update order status",
        };
      }
      if (!orderId) {
        return {
          success: false,
          output: inputData,
          error: "order_id is required",
        };
      }
      if (!status) {
        return {
          success: false,
          output: inputData,
          error: "status is required",
        };
      }

      const updated = await EcommerceOrder.findOneAndUpdate(
        { _id: orderId, user_id: userId, deleted_at: null },
        { $set: { status } },
        { new: true },
      ).lean();

      return {
        success: !!updated,
        output: { ...inputData, order: updated, order_status_updated: status },
        ...(updated ? {} : { error: "Order not found" }),
      };
    }

    return {
      success: true,
      output: { ...inputData, custom_executed: true },
    };
  }

  async executeEndFlowNode(node, inputData) {
    const { goodbye_message, end_action, tags } = node.parameters || {};
    // If there's a goodbye message, send it before ending
    if (goodbye_message) {
      const sendNode = {
        ...node,
        parameters: {
          ...node.parameters,
          message_template: goodbye_message,
          recipient: inputData.senderNumber || "{{senderNumber}}",
          provider_type: node.parameters?.provider_type || "business_api",
        },
      };
      await this.executeSendMessageNode(sendNode, inputData).catch(() => {});
    }
    return {
      success: true,
      output: {
        ...inputData,
        flowEnded: true,
        endAction: end_action || "close_session",
      },
    };
  }

  async executeSetVariableNode(node, inputData) {
    const { variables } = node.parameters || {};
    const output = { ...inputData };
    if (Array.isArray(variables)) {
      variables.forEach(({ key, value }) => {
        if (key)
          output[key] = this.processTemplateString(
            String(value ?? ""),
            inputData,
          );
      });
    }
    return { success: true, output };
  }

  async executeUserInputNode(node, inputData) {
    const { question, variable } = node.parameters || {};

    // Send the question message to the user
    if (question) {
      const sendNode = {
        ...node,
        parameters: {
          ...node.parameters,
          message_template: question,
          recipient: inputData.senderNumber || "{{senderNumber}}",
          provider_type: node.parameters?.provider_type || "business_api",
        },
      };
      await this.executeSendMessageNode(sendNode, inputData).catch(() => {});
    }

    // Signal the engine to pause and wait for user reply
    return {
      success: true,
      waitForInput: true,
      variableName: variable || null,
      output: inputData,
    };
  }

  async saveFlowSession(flow, node, sessionData, variableName) {
    try {
      const senderNumber = sessionData.senderNumber;
      const userId = sessionData.userId || sessionData.user_id;
      if (!senderNumber || !userId) return;

      // Expire any existing waiting sessions for this sender
      await FlowSession.updateMany(
        { sender_number: senderNumber, user_id: userId, status: "waiting" },
        { $set: { status: "expired" } },
      );

      const { timeout_seconds } = node.parameters || {};
      const timeoutMs = timeout_seconds
        ? timeout_seconds * 1000
        : 30 * 60 * 1000; // default 30 min

      await FlowSession.create({
        sender_number: senderNumber,
        user_id: userId,
        flow_id: flow._id,
        whatsapp_phone_number_id: sessionData.whatsappPhoneNumberId || null,
        current_node_id: node.id,
        session_data: sessionData,
        variable_name: variableName || null,
        status: "waiting",
        expires_at: new Date(Date.now() + timeoutMs),
      });

      console.log(
        `Flow session saved: waiting for reply from ${senderNumber} at node ${node.id}`,
      );
    } catch (err) {
      console.error("Failed to save flow session:", err.message);
    }
  }

  async resumeFlowFromSession(session, userMessage, eventData) {
    try {
      const flow = await AutomationFlow.findById(session.flow_id);
      if (!flow || !flow.is_active || flow.deleted_at) {
        await FlowSession.findByIdAndUpdate(session._id, {
          $set: { status: "expired" },
        });
        return;
      }

      // Mark session as completed so it won't be matched again
      await FlowSession.findByIdAndUpdate(session._id, {
        $set: { status: "completed" },
      });

      // Restore context and inject user reply into the named variable
      const resumeData = { ...(session.session_data || {}) };
      if (session.variable_name) {
        resumeData[session.variable_name] = userMessage;
      }
      // Update message field so condition nodes (button/list branching) evaluate correctly.
      // For button clicks, userMessage is the button's ID (e.g. "f12ab3___Yes").
      resumeData.userReply = userMessage;
      resumeData.message = userMessage;

      // Refresh live event fields (phone number may differ between requests)
      if (eventData.whatsappPhoneNumberId)
        resumeData.whatsappPhoneNumberId = eventData.whatsappPhoneNumberId;
      if (eventData.contactId) resumeData.contactId = eventData.contactId;

      const currentNode = flow.nodes.find(
        (n) => n.id === session.current_node_id,
      );
      if (!currentNode) {
        console.warn(
          `Resumed session but node ${session.current_node_id} not found in flow ${flow._id}`,
        );
        return;
      }

      console.log(
        `Resuming flow ${flow.name} from node ${currentNode.id}, reply: "${userMessage}"`,
      );
      const executionLog = [];

      // Button and list message nodes store their branch conditions as children of the
      // TRIGGER node (not of the button_message node itself).  The condition node IDs
      // encode the button_message they belong to using the pattern:
      //   cond-btn-___<buttonNodeId>___<btnIdx>___<targetNodeId>
      //   cond-list-___<listNodeId>___<sectionIdx>___<itemIdx>___<targetNodeId>
      // We detect this and evaluate those conditions directly instead of traversing
      // the button_message node's (empty) direct children.
      const isInteractivePause =
        currentNode.type === "send_message" &&
        (currentNode.parameters?.interactive_type === "button" ||
          currentNode.parameters?.interactive_type === "list");

      if (isInteractivePause) {
        // Find all condition nodes whose ID contains the button/list message node ID
        const branchConditions = flow.nodes.filter(
          (n) =>
            n.type === "condition" &&
            n.id.includes(`___${session.current_node_id}___`),
        );

        console.log(
          `Found ${branchConditions.length} branch conditions for node ${session.current_node_id}`,
        );

        let branchMatched = false;
        for (const condNode of branchConditions) {
          console.log(
            `Evaluating condition node ${condNode.id}, params:`,
            JSON.stringify(condNode.parameters),
          );
          const condResult = await this.executeConditionNode(
            condNode,
            resumeData,
          );
          console.log(`Condition result: ${condResult.success}`);
          if (condResult.success) {
            // Button/list branch conditions connect from cond node to the first action node via 'src' handle
            const branchNodes = [
              ...this.getConnectedNodesByHandle(flow, condNode.id, "src"),
              ...this.getConnectedNodesByHandle(flow, condNode.id, "src-true"),
            ];
            console.log(
              `Branch nodes found: ${branchNodes.map((n) => n.id).join(", ")}`,
            );
            for (const branchNode of branchNodes) {
              // Execute branchNode directly (processConnectedNodes only executes children, not the node itself)
              console.log(
                `Executing branch node ${branchNode.id} (type: ${branchNode.type})`,
              );
              const nodeResult = await this.executeNode(
                branchNode,
                flow,
                resumeData,
                executionLog,
              );
              console.log(
                `Branch node result: success=${nodeResult.success}, waitForInput=${nodeResult.waitForInput}`,
              );
              if (nodeResult.waitForInput) {
                await this.saveFlowSession(
                  flow,
                  branchNode,
                  { ...resumeData, ...nodeResult.output },
                  nodeResult.variableName,
                );
                return;
              }
              if (nodeResult.success) {
                const updatedData = {
                  ...resumeData,
                  ...nodeResult.output,
                  userId: resumeData.userId || resumeData.user_id,
                };
                await this.processConnectedNodes(
                  flow,
                  branchNode,
                  updatedData,
                  executionLog,
                  resumeData,
                );
              } else {
                console.error(
                  `Branch node ${branchNode.id} failed:`,
                  nodeResult.error,
                );
              }
            }
            branchMatched = true;
            // Stop after first matching branch (only one button/item can be selected)
            break;
          }
        }

        // If no condition matched (or no conditions exist), fall through to the node's
        // direct children in flow.connections.  This handles list/button messages that
        // don't have per-item branches — the flow simply continues to the next node.
        if (!branchMatched) {
          console.log(
            `No branch matched for interactive pause — continuing from node ${currentNode.id}`,
          );
          await this.processConnectedNodes(
            flow,
            currentNode,
            resumeData,
            executionLog,
            resumeData,
          );
        }
        return;
      }

      // For user_input pauses: normal graph traversal from the paused node
      await this.processConnectedNodes(
        flow,
        currentNode,
        resumeData,
        executionLog,
        resumeData,
      );
    } catch (err) {
      console.error("Error resuming flow from session:", err.message);
    }
  }

  async executeJumpToFlowNode(node, inputData) {
    const { target_flow_id } = node.parameters || {};
    if (!target_flow_id) return { success: true, output: inputData };

    try {
      const targetFlow = await AutomationFlow.findById(target_flow_id).lean();
      if (targetFlow && targetFlow.is_active && !targetFlow.deleted_at) {
        await this.executeFlow(targetFlow, inputData);
      }
    } catch (err) {
      // Non-fatal — log and continue
    }
    return {
      success: true,
      output: { ...inputData, jumpedToFlow: target_flow_id },
    };
  }

  async executeDisableAutoReplyNode(node, inputData) {
    const { duration, duration_unit } = node.parameters || {};
    // Mark in output so the session handler can pause auto-reply for this contact
    return {
      success: true,
      output: {
        ...inputData,
        disableAutoReply: true,
        disableDuration: duration || 30,
        disableDurationUnit: duration_unit || "minutes",
      },
    };
  }

  async executeResetSessionNode(node, inputData) {
    const { reset_scope, keep_variables } = node.parameters || {};
    const keepSet = new Set(
      Array.isArray(keep_variables) ? keep_variables : [],
    );
    const preserved = {};
    // Always keep system fields
    const SYSTEM_KEYS = [
      "userId",
      "user_id",
      "senderNumber",
      "whatsappPhoneNumberId",
      "contactId",
      "event_type",
    ];
    SYSTEM_KEYS.forEach((k) => {
      if (inputData[k] !== undefined) preserved[k] = inputData[k];
    });
    if (reset_scope !== "session") {
      keepSet.forEach((k) => {
        if (inputData[k] !== undefined) preserved[k] = inputData[k];
      });
    }
    return { success: true, output: preserved };
  }

  async executeSendEmailNode(node, inputData) {
    const {
      smtp_host,
      smtp_port,
      smtp_encryption,
      smtp_user,
      smtp_password,
      from_name,
      from_email,
      to_email,
      cc,
      subject,
      body,
    } = node.parameters || {};
    if (!smtp_host || !smtp_user || !to_email || !subject) {
      return {
        success: false,
        output: inputData,
        error: "Missing required email fields (host, user, to, subject)",
      };
    }
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: smtp_host,
        port: parseInt(smtp_port || "587", 10),
        secure: smtp_encryption === "ssl",
        auth: { user: smtp_user, pass: smtp_password || "" },
      });
      await transporter.sendMail({
        from: from_name
          ? `"${from_name}" <${from_email || smtp_user}>`
          : from_email || smtp_user,
        to: this.processTemplateString(to_email, inputData),
        cc: Array.isArray(cc) ? cc.join(", ") : cc || undefined,
        subject: this.processTemplateString(subject, inputData),
        text: this.processTemplateString(body || "", inputData),
      });
      return { success: true, output: { ...inputData, emailSent: true } };
    } catch (err) {
      return {
        success: false,
        output: inputData,
        error: `Email send failed: ${err.message}`,
      };
    }
  }

  async executeGoogleSheetsNode(node, inputData) {
    // Full Google Sheets integration requires oauth2client setup
    // Return success stub so the flow doesn't crash
    return {
      success: true,
      output: { ...inputData, googleSheetsExecuted: true },
    };
  }

  async executeMysqlQueryNode(node, inputData) {
    // Full MySQL integration requires mysql2 client setup
    // Return success stub so the flow doesn't crash
    return { success: true, output: { ...inputData, mysqlExecuted: true } };
  }

  async executeAgentTransferNode(node, inputData) {
    const { team_id, priority, note, queue_message } = node.parameters || {};
    if (queue_message) {
      const sendNode = {
        ...node,
        parameters: {
          ...node.parameters,
          message_template: queue_message,
          recipient: inputData.senderNumber || "{{senderNumber}}",
          provider_type: node.parameters?.provider_type || "business_api",
        },
      };
      await this.executeSendMessageNode(sendNode, inputData).catch(() => {});
    }
    return {
      success: true,
      output: {
        ...inputData,
        agentTransfer: true,
        teamId: team_id,
        priority: priority || "normal",
        note: note || "",
      },
    };
  }

  async executeAiTransferNode(node, inputData) {
    const { assistant_id, model, system_prompt } = node.parameters || {};
    return {
      success: true,
      output: {
        ...inputData,
        aiTransfer: true,
        assistantId: assistant_id,
        model: model || "gpt-4o",
        systemPrompt: system_prompt || "",
      },
    };
  }

  async updateFlowStatistics(flowId, success) {
    try {
      const update = {
        $inc: {
          "statistics.total_executions": 1,
          "statistics.average_execution_time": 0,
        },
      };

      if (success) {
        update.$inc["statistics.successful_executions"] = 1;
      } else {
        update.$inc["statistics.failed_executions"] = 1;
      }

      update.$set = { "statistics.last_execution": new Date() };

      await AutomationFlow.findByIdAndUpdate(flowId, update);
    } catch (error) {
      console.error("Error updating flow statistics:", error);
    }
  }

  async triggerEvent(eventType, eventData) {
    console.log("Triggering event:", eventType, "with data:", eventData);
    const handler = this.eventListeners.get(eventType);
    if (handler) {
      console.log("Found handler for event:", eventType);
      await handler(eventData);
    } else {
      console.log(
        "No handler found for event:",
        eventType,
        "Available handlers:",
        Array.from(this.eventListeners.keys()),
      );
    }
  }

  getRunningExecutions() {
    return Array.from(this.runningExecutions.values());
  }

  async cancelExecution(executionId) {
    if (this.runningExecutions.has(executionId)) {
      await AutomationExecution.findByIdAndUpdate(
        this.runningExecutions.get(executionId),
        { status: "cancelled", completed_at: new Date() },
      );
      this.runningExecutions.delete(executionId);
    }
  }
}

const automationEngine = new AutomationEngine();

export default automationEngine;
