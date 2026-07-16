import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import enginesRouter from "./engines";
import recommendationsRouter from "./recommendations";
import rulesRouter from "./rules";
import ontologyRouter from "./ontology";
import graphRouter from "./graph";
import sapRouter from "./sap";
import backtestRouter from "./backtest";
import exchangeRouter from "./exchange";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(enginesRouter);
router.use(recommendationsRouter);
router.use(rulesRouter);
router.use(ontologyRouter);
router.use(graphRouter);
router.use(sapRouter);
router.use(backtestRouter);
router.use(exchangeRouter);

export default router;
