-- Set these transaction-local claims after authenticating every request:
-- SET LOCAL app.organization_id = '<uuid>';
-- SET LOCAL app.user_id = '<uuid>';

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Home" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Hub" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HubCertificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Entitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RemoteCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_isolation ON "Organization"
USING (id = current_setting('app.organization_id', true)::uuid)
WITH CHECK (id = current_setting('app.organization_id', true)::uuid);

CREATE POLICY membership_isolation ON "Membership"
USING ("organizationId" = current_setting('app.organization_id', true)::uuid)
WITH CHECK ("organizationId" = current_setting('app.organization_id', true)::uuid);

CREATE POLICY home_isolation ON "Home"
USING ("organizationId" = current_setting('app.organization_id', true)::uuid)
WITH CHECK ("organizationId" = current_setting('app.organization_id', true)::uuid);

CREATE POLICY hub_isolation ON "Hub"
USING ("organizationId" = current_setting('app.organization_id', true)::uuid)
WITH CHECK ("organizationId" = current_setting('app.organization_id', true)::uuid);

CREATE POLICY entitlement_isolation ON "Entitlement"
USING ("organizationId" = current_setting('app.organization_id', true)::uuid)
WITH CHECK ("organizationId" = current_setting('app.organization_id', true)::uuid);

CREATE POLICY command_isolation ON "RemoteCommand"
USING ("organizationId" = current_setting('app.organization_id', true)::uuid)
WITH CHECK ("organizationId" = current_setting('app.organization_id', true)::uuid);

CREATE POLICY audit_isolation ON "AuditEvent"
USING ("organizationId" = current_setting('app.organization_id', true)::uuid)
WITH CHECK ("organizationId" = current_setting('app.organization_id', true)::uuid);

-- HubCertificate inherits tenant scope through Hub; expose it only through
-- security-definer functions or tenant-checked joins, not direct public queries.
REVOKE ALL ON "HubCertificate" FROM PUBLIC;
