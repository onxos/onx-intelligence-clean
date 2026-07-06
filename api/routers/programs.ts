import { createTRPCRouter, publicProcedure } from "../lib/trpc";
import { programs } from "../lib/datasets";

const byCode = (code: string) => programs.find((p: { code: string }) => p.code.toLowerCase() === code.toLowerCase());

export const cepRouter = createTRPCRouter({ overview: publicProcedure.query(() => byCode("CEP")) });
export const ocppRouter = createTRPCRouter({ overview: publicProcedure.query(() => byCode("OCPP")) });
export const cevpRouter = createTRPCRouter({ overview: publicProcedure.query(() => byCode("CEVP")) });
export const ccopRouter = createTRPCRouter({ overview: publicProcedure.query(() => byCode("CCOP")) });
export const cosRouter = createTRPCRouter({ overview: publicProcedure.query(() => byCode("COS")) });
export const ucrRouter = createTRPCRouter({ overview: publicProcedure.query(() => byCode("UCR")) });
