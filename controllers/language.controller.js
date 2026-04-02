import { Language, Setting } from '../models/index.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'sort_order';
const ALLOWED_SORT_FIELDS = ['name', 'locale', 'is_rtl', 'is_active', 'sort_order', 'created_at', 'updated_at'];

const parsePaginationParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
    const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const parseSortParams = (query) => {
    const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
        ? query.sort_by
        : DEFAULT_SORT_FIELD;

    const sortOrder = query.sort_order?.toUpperCase() === 'DESC'
        ? SORT_ORDER.DESC
        : SORT_ORDER.ASC;

    return { sortField, sortOrder };
};

const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return {};
    }

    const sanitizedSearch = searchTerm.trim();

    return {
        $or: [
            { name: { $regex: sanitizedSearch, $options: 'i' } },
            { locale: { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};

const validateLanguageData = (languageData) => {
    const errors = [];

    if (!languageData.name || !languageData.name.trim()) {
        errors.push('Language name is required');
    }

    if (!languageData.locale || !languageData.locale.trim()) {
        errors.push('Language locale is required');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'Language IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid Language IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
};

const cleanupFiles = (files) => {
    if (!files) return;

    Object.values(files).forEach(fileArray => {
        fileArray.forEach(file => {
            if (file?.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        });
    });
};

export const createLanguage = async (req, res) => {
    let translationPath = null;
    let flagPath = null;
    try {
        const languageData = req.body;

        const validation = validateLanguageData(languageData);
        if (!validation.isValid) {
            cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Language validation failed',
                errors: validation.errors
            });
        }

        const { name, locale, is_rtl, is_active } = languageData;

        const existingLanguage = await Language.findOne({ locale: locale.trim(), deleted_at: null });
        if (existingLanguage) {
            cleanupFiles(req.files);
            return res.status(409).json({
                success: false,
                message: 'A language with this locale already exists'
            });
        }

        const languageLocale = locale.trim();

        if (req.files) {
            if (req.files.translation_json && req.files.translation_json[0]) {
                const file = req.files.translation_json[0];
                const ext = path.extname(file.originalname).toLowerCase();
                if (ext !== '.json') {
                    cleanupFiles(req.files);
                    return res.status(400).json({
                        success: false,
                        message: 'Only JSON files are allowed for translations'
                    });
                }
                translationPath = file.path;
            }

            if (req.files.flag && req.files.flag[0]) {
                flagPath = req.files.flag[0].path;
            }
        }

        const language = await Language.create({
            name: name.trim(),
            locale: languageLocale,
            flag: flagPath,
            translation_json: translationPath,
            is_rtl: is_rtl !== undefined ? is_rtl : false,
            is_active: is_active !== undefined ? is_active : true
        });

        let setting = await Setting.findOne();
        if (!setting) {
            setting = await Setting.create({
                default_language: language.locale
            });
        } else if (!setting.default_language) {
            setting.default_language = language.locale;
            await setting.save();
        }

        return res.status(201).json({
            success: true,
            message: 'Language created successfully',
            data: language
        });
    } catch (error) {
        console.error('Error creating language:', error);
        cleanupFiles(req.files);
        return res.status(500).json({
            success: false,
            message: 'Failed to create language',
            error: error.message
        });
    }
};

export const getLanguages = async (req, res) => {
    try {
        console.log("calledd");
        const { search, is_active } = req.query;

        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);

        const searchQuery = buildSearchQuery(search);

        searchQuery.deleted_at = null;

        if (is_active !== undefined) {
            searchQuery.is_active = is_active === 'true';
        }

        const languages = await Language.find(searchQuery)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Language.countDocuments(searchQuery);

        const updatedLanguages = languages.map((lang) => {
            let translations = {};

            if (lang.translation_json && typeof lang.translation_json === 'string') {
                const filePath = path.join(process.cwd(), lang.translation_json);

                if (fs.existsSync(filePath)) {
                    try {
                        const fileContent = fs.readFileSync(filePath, 'utf-8');
                        translations = JSON.parse(fileContent);
                    } catch (err) {
                        console.error('JSON parse error:', err.message);
                        translations = {};
                    }
                }
            } else if (typeof lang.translation_json === 'object') {
                translations = lang.translation_json;
            }

            return {
                ...lang,
                translation_json: translations
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                languages: updatedLanguages,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching languages:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch languages',
            error: error.message
        });
    }
};

export const getLanguageById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid language ID'
            });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null }).lean();

        if (!language) {
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }
        let translations = {};

        if (language.translation_json && typeof language.translation_json === 'string') {
            const filePath = path.join(process.cwd(), language.translation_json);

            if (fs.existsSync(filePath)) {
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    translations = JSON.parse(fileContent);
                } catch (err) {
                    console.error('JSON parse error:', err.message);
                    translations = {};
                }
            }
        } else if (typeof language.translation_json === 'object') {
            translations = language.translation_json;
        }

        const updatedLanguage = {
            ...language,
            translation_json: translations
        };

        return res.status(200).json({
            success: true,
            data: updatedLanguage
        });
    } catch (error) {
        console.error('Error fetching language:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch language',
            error: error.message
        });
    }
};

export const updateLanguage = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Invalid language ID'
            });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null });

        if (!language) {
            cleanupFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }

        const validation = validateLanguageData({
            ...language.toObject(),
            ...updateData
        });

        if (!validation.isValid) {
            cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Language validation failed',
                errors: validation.errors
            });
        }

        if (updateData.locale) {
            const newLocale = updateData.locale.trim();
            if (newLocale !== language.locale) {
                const existingLanguage = await Language.findOne({ locale: newLocale, _id: { $ne: id }, deleted_at: null });
                if (existingLanguage) {
                    cleanupFiles(req.files);
                    return res.status(409).json({
                        success: false,
                        message: 'A language with this locale already exists'
                    });
                }
                language.locale = newLocale;
            }
        }

        const oldTranslationPath = language.translation_json;
        const oldFlagPath = language.flag;

        if (req.files) {
            if (req.files.translation_json && req.files.translation_json[0]) {
                const file = req.files.translation_json[0];
                const ext = path.extname(file.originalname).toLowerCase();
                if (ext !== '.json') {
                    cleanupFiles(req.files);
                    return res.status(400).json({
                        success: false,
                        message: 'Only JSON files are allowed for translations'
                    });
                }
                language.translation_json = file.path;
            }

            if (req.files.flag && req.files.flag[0]) {
                language.flag = req.files.flag[0].path;
            }
        }

        if (updateData.name !== undefined) language.name = updateData.name.trim();
        if (updateData.flag !== undefined && (!req.files || !req.files.flag)) language.flag = updateData.flag;
        if (updateData.is_rtl !== undefined) language.is_rtl = updateData.is_rtl;

        if (updateData.is_active !== undefined) {
            const settings = await Setting.findOne().select('default_language').lean();
            if (language.locale === settings?.default_language && updateData.is_active === false) {
                cleanupFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Default language cannot be disabled. Please change the default language first.'
                });
            }
            language.is_active = updateData.is_active;
        }

        await language.save();

        if (req.files) {
            if (req.files.translation_json && oldTranslationPath && typeof oldTranslationPath === 'string' && oldTranslationPath !== language.translation_json) {
                const oldPath = path.join(process.cwd(), oldTranslationPath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            if (req.files.flag && oldFlagPath && oldFlagPath !== language.flag) {
                const oldPath = path.join(process.cwd(), oldFlagPath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Language updated successfully',
            data: language
        });
    } catch (error) {
        console.error('Error updating language:', error);
        cleanupFiles(req.files);
        return res.status(500).json({
            success: false,
            message: 'Failed to update language',
            error: error.message
        });
    }
};

export const deleteLanguages = async (req, res) => {
    try {
        const { ids } = req.body;

        const validation = validateAndFilterIds(ids);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const { validIds } = validation;

        const languages = await Language.find({
            _id: { $in: validIds },
            deleted_at: null
        });

        if (languages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No languages found with the provided IDs'
            });
        }

        const foundIds = languages.map(l => l._id.toString());
        const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

        const deletableIds = [];
        const usedIds = [];

        for (const languageId of foundIds) {
            const language = languages.find(l => l._id.toString() === languageId);
            const isDefault = await Setting.findOne({ default_language: language.locale });
            if (isDefault) {
                usedIds.push(languageId);
            } else {
                deletableIds.push(languageId);
            }
        }

        if (deletableIds.length > 0) {
            await Language.updateMany(
                { _id: { $in: deletableIds } },
                { $set: { deleted_at: new Date() } }
            );
        }

        const response = {
            success: true,
            message: `${deletableIds.length} language(s) deleted successfully`,
            data: {
                deletedCount: deletableIds.length,
                deletedIds: deletableIds
            }
        };

        if (usedIds.length > 0) {
            response.data.usedIds = usedIds;
            response.message += `, ${usedIds.length} language(s) are set as system default and cannot be deleted`;
        }

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} language(s) not found`;
        }

        return res.status(200).json(response);

    } catch (error) {
        console.error('Error deleting languages:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete languages',
            error: error.message
        });
    }
};

export const getTranslations = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid language ID' });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null });
        if (!language) {
            return res.status(404).json({ success: false, message: 'Language not found' });
        }

        const filePath = path.join(process.cwd(), language.translation_json);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'Translation file not found' });
        }

        const fileContent = fs.readFileSync(filePath, 'utf8'
        );
        const translations = JSON.parse(fileContent);

        return res.status(200).json({
            success: true,
            data: translations
        });
    } catch (error) {
        console.error('Error fetching translations:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch translations', error: error.message });
    }
};

export const updateTranslations = async (req, res) => {
    try {
        const { id } = req.params;
        const { translations } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid language ID' });
        }

        if (!translations || typeof translations !== 'object') {
            return res.status(400).json({ success: false, message: 'Invalid translations format' });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null });
        if (!language) {
            return res.status(404).json({ success: false, message: 'Language not found' });
        }

        const filePath = path.join(process.cwd(), language.translation_json);
        const uploadDir = path.join(process.cwd(), 'uploads', 'languages');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(translations, null, 2));

        return res.status(200).json({
            success: true,
            message: 'Translations updated successfully'
        });
    } catch (error) {
        console.error('Error updating translations:', error);
        return res.status(500).json({ success: false, message: 'Failed to update translations', error: error.message });
    }
};

export const toggleLanguageStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid language ID'
            });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null });

        if (!language) {
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }

        if (language.is_active) {
            const settings = await Setting.findOne().select('default_language').lean();
            if (language.locale === settings?.default_language) {
                return res.status(400).json({
                    success: false,
                    message: 'Default language cannot be deactivated. Please change the default language first.'
                });
            }
        }

        language.is_active = !language.is_active;
        await language.save();

        return res.status(200).json({
            success: true,
            message: `Language ${language.is_active ? 'activated' : 'deactivated'} successfully`,
            data: language
        });
    } catch (error) {
        console.error('Error toggling language status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle language status',
            error: error.message
        });
    }
};

export const toggleDefaultLanguage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid language ID'
            });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null });

        if (!language) {
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }

        if (language.is_active == false) {
            return res.status(400).json({
                success: false,
                message: 'A deactivated language cannot be set as default.'
            });
        }

        let setting = await Setting.findOne();
        if (!setting) {
            setting = await Setting.create({ default_language: language.locale });
        } else {
            setting.default_language = language.locale;
            await setting.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Default language updated successfully',
            data: language
        });
    } catch (error) {
        console.error('Error toggling default language:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle default language',
            error: error.message
        });
    }
};

export default {
    createLanguage,
    getLanguages,
    getLanguageById,
    updateLanguage,
    deleteLanguages,
    toggleLanguageStatus,
    getTranslations,
    updateTranslations,
    toggleDefaultLanguage
};
