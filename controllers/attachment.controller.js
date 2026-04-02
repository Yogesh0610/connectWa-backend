import { Attachment } from '../models/index.js';
import fs from 'fs';
import path from 'path';

export const createAttachment = async (req, res) => {
  try {
    const { folder, tags, description } = req.body;
    const userId = req.user.owner_id;

    if (!req.files || !req.files.length) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const attachments = [];

    for (const file of req.files) {
      const relativePath = `/${file.destination}/${file.filename}`.replace(/\\/g, '/');
      const absoluteUrl = `${req.protocol}://${req.get('host')}${relativePath}`;

      const attachmentData = {
        fileName: file.originalname,
        fileUrl: relativePath,
        fileSize: file.size,
        fileType: getFileType(file.mimetype),
        mimeType: file.mimetype,
        createdBy: userId,
        folder: folder || 'attachments',
        description
      };

      if (tags) {
        attachmentData.tags = Array.isArray(tags)
          ? tags
          : tags.split(',').map(tag => tag.trim());
      }

      const attachment = await Attachment.create(attachmentData);

      attachments.push({
        ...attachment.toObject(),
        fileUrl: absoluteUrl
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Attachments uploaded successfully',
      data: attachments
    });
  } catch (error) {
    console.error('Error creating attachments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create attachments',
      error: error.message
    });
  }
};

export const getAttachments = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const {
      page = 1,
      limit = 20,
      fileType,
      mimeType,
      folder,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = { createdBy: userId };

    if (fileType) filter.fileType = fileType;
    if (mimeType) filter.mimeType = mimeType;
    if (folder) filter.folder = folder;
    if (search) {
      filter.$or = [
        { fileName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const skip = (page - 1) * limit;

    const attachments = await Attachment.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v')
      .lean();

    const total = await Attachment.countDocuments(filter);


    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const formattedAttachments = attachments.map(att => {
      let fileUrl = att.fileUrl;

      if (!fileUrl) {
        fileUrl = null;
      }
      else if (fileUrl.startsWith('http')) {
        fileUrl = fileUrl;
      }
      else if (fileUrl.startsWith('/uploads/') && !fileUrl.includes('/attachments/')) {
        fileUrl = `${baseUrl}/uploads/attachments/${fileUrl.split('/').pop()}`;
      }
      else {
        fileUrl = `${baseUrl}${fileUrl}`;
      }

      return {
        ...att,
        fileUrl
      };
    });


    res.status(200).json({
      success: true,
      data: formattedAttachments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attachments',
      error: error.message
    });
  }
};

export const getAttachmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const attachment = await Attachment.findOne({
      _id: id,
      createdBy: userId
    }).select('-__v');

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    const absoluteUrl = `${req.protocol}://${req.get('host')}${attachment.fileUrl}`;

    return res.status(200).json({
      success: true,
      data: {
        ...attachment.toObject(),
        fileUrl: absoluteUrl
      }
    });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch attachment',
      error: error.message
    });
  }
};


export const deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const attachment = await Attachment.findOne({
      _id: id,
      createdBy: userId
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    const filePath = path.join(process.cwd(), 'uploads', path.basename(attachment.fileUrl));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Attachment.deleteOne({ _id: id });

    res.status(200).json({
      success: true,
      message: 'Attachment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete attachment',
      error: error.message
    });
  }
};

export const bulkDeleteAttachments = async (req, res) => {
  try {
    const { ids } = req.body;
    const userId = req.user.owner_id;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of attachment IDs'
      });
    }

    const attachments = await Attachment.find({
      _id: { $in: ids },
      createdBy: userId
    }).lean();

    const foundIds = attachments.map(a => a._id.toString());
    const notFoundIds = ids.filter(
      id => !foundIds.includes(id.toString())
    );

    for (const attachment of attachments) {
      const absolutePath = path.join(
        process.cwd(),
        attachment.fileUrl.replace(/^\//, '')
      );

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    const deleteResult = await Attachment.deleteMany({
      _id: { $in: foundIds },
      createdBy: userId
    });

    const response = {
      success: true,
      message: `${deleteResult.deletedCount} attachment(s) deleted successfully`,
      data: {
        deletedCount: deleteResult.deletedCount,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} attachment(s) not found`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error bulk deleting attachments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk delete attachments',
      error: error.message
    });
  }
};


const getFileType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.includes('pdf') || mimetype.includes('document') || mimetype.includes('text')) {
    return 'document';
  }
  return 'file';
};
