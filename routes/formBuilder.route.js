import express from "express";
import formBuilderController from "../controllers/formBuilder.controller.js";
import { authenticate } from "../middlewares/auth.js";

const router = express.Router();


router.use(authenticate);

router.route("/")
    .get(formBuilderController.getAllForms)
    .post(formBuilderController.createForm);

router.route("/sync")
    .post(formBuilderController.syncMetaFlow);

router.route("/sync-status")
    .post(formBuilderController.syncFlowsStatusFromMeta);

router.route("/:id/publish")
    .patch(formBuilderController.publishForm);

router.get("/meta-flows/:waba_id", formBuilderController.getAllMetaFlows);

router.route("/:id")
    .get(formBuilderController.getFormById)
    .patch(formBuilderController.updateForm)
    .delete(formBuilderController.deleteForm);

export default router;
