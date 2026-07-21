ALTER TABLE "Device" ADD COLUMN "controlProvider" TEXT NOT NULL DEFAULT 'UNBOUND';
ALTER TABLE "Device" ADD COLUMN "controlTarget" TEXT;
ALTER TABLE "Device" ADD COLUMN "desiredState" TEXT;
ALTER TABLE "Device" ADD COLUMN "lastCommandStatus" TEXT NOT NULL DEFAULT 'IDLE';
ALTER TABLE "Device" ADD COLUMN "lastCommandError" TEXT;
ALTER TABLE "Device" ADD COLUMN "lastReportedAt" DATETIME;

CREATE INDEX "Device_controlProvider_controlTarget_idx"
ON "Device"("controlProvider", "controlTarget");
