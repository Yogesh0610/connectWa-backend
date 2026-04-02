import express from "express";
import * as submissionController from "../controllers/submission.controller.js";
import { authenticate } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticate);

router.get("/:form_id", submissionController.getSubmissionsByFormId);
router.get("/:id/details", submissionController.getSubmissionDetails);
router.get("/:form_id/stats", submissionController.getSubmissionStats);
router.patch("/:id/status", submissionController.updateSubmissionStatus);
router.delete("/:id", submissionController.deleteSubmission);

export default router;
