import z from 'zod';

//
// [IMPORTANT]
// - Since we want the `strict()` on job payloads to guarantee no data is left behind, we have to extend the maintenance object otherwise it will be seen as an unrecognized key into jobs data
// - We have to force dates conversion since `pg-boss` provides it as strings from the database
// - A modification into the worker function needs a server restart
//

export const MaintenanceDataSchema = z
  .object({
    requestedAt: z.coerce.date(),
    originalJobId: z.string().uuid(),
    replayedMaintenanceJobId: z.string().uuid().optional(),
  })
  .strict();
export type MaintenanceDataSchemaType = z.infer<typeof MaintenanceDataSchema>;

export const MaintenanceWrapperDataSchema = z.object({
  // This object is not `.strict()` because it's intented to have other keys aside
  __maintenance__: MaintenanceDataSchema.optional(),
});
export type MaintenanceWrapperDataSchemaType = z.infer<typeof MaintenanceWrapperDataSchema>;
