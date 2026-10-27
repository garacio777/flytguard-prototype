import { z } from "zod";

// 1. Strict Input Validation (Blocks prompt-stuffing & oversized payloads)
export const DispatchRequestSchema = z.object({
  rawMessage: z
    .string()
    .trim()
    .min(10, "Meldingen er for kort til å tolkes.")
    .max(500, "Meldingen overskrider maks lengde (500 tegn)."),
  projectSiteId: z
    .string()
    .regex(/^PROJ-[0-9]{4}$/, "Ugyldig prosjekt-ID format (f.eks. PROJ-1042).")
}).strict();

// 2. Strict Output Validation (Forces LLM output into deterministic business logic)
export const EquipmentCategoryEnum = z.enum([
  "GRAVEMASKIN",
  "HJULLASTER",
  "LIFT_STILLAS",
  "STRØM_VARME_LYS",
  "KOMPRIMERING"
]);

export const DispatchItemSchema = z.object({
  category: EquipmentCategoryEnum,
  modelSpecification: z.string().min(2).max(80),
  quantity: z.number().int().min(1).max(20),
  deliveryLocation: z.string().min(2).max(120),
  requestedStartIso: z.string().datetime({ offset: true }),
  requiresCertifiedOperator: z.boolean()
}).strict();

export const DispatchOutputSchema = z.object({
  confidenceScore: z.number().min(0).max(1),
  needsHumanReview: z.boolean(),
  items: z.array(DispatchItemSchema).min(1).max(10),
  safetyNotes: z.string().max(250)
}).strict();

// 3. Upstream Chat Completion Envelope Validation (Zone 4 Worker boundary)
export const LlmCompletionEnvelopeSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().min(2)
        })
      })
    )
    .min(1)
});

// 4. Deterministic API Response Contracts (Zone 1 <-> Zone 4 boundary)
export const FlattenedValidationErrorSchema = z.object({
  formErrors: z.array(z.string()),
  fieldErrors: z.record(z.string(), z.array(z.string()).optional())
});

export const DispatchApiSuccessSchema = z.object({
  status: z.literal("VALIDATED"),
  data: DispatchOutputSchema
}).strict();

export const DispatchApiErrorSchema = z.object({
  error: z.string(),
  details: FlattenedValidationErrorSchema.optional(),
  violations: FlattenedValidationErrorSchema.optional()
}).strict();

export type EquipmentCategory = z.infer<typeof EquipmentCategoryEnum>;
export type DispatchItem = z.infer<typeof DispatchItemSchema>;
export type DispatchRequest = z.infer<typeof DispatchRequestSchema>;
export type DispatchOutput = z.infer<typeof DispatchOutputSchema>;
export type FlattenedValidationError = z.infer<typeof FlattenedValidationErrorSchema>;
export type DispatchApiSuccess = z.infer<typeof DispatchApiSuccessSchema>;
export type DispatchApiError = z.infer<typeof DispatchApiErrorSchema>;
