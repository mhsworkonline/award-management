"use client";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell/page-header";
import { ConfigSection } from "./config-section";
import { BrandingSection } from "./branding-section";
import { QrCodeSection } from "./qr-code-section";
import { AccessSection } from "./access-section";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Lookups, Organization, RoleWithPermissions, UserRow } from "@/lib/types";

export function SettingsClient({
  lookups,
  organization,
  isAdmin,
  roles,
  users,
  currentUserId,
}: {
  lookups: Lookups;
  organization: Organization | null;
  isAdmin: boolean;
  roles: RoleWithPermissions[];
  users: UserRow[];
  currentUserId: string;
}) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Everything here is data, not code — add a board, medium, course or award category and it appears in every form immediately."
      />

      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="years">Academic years</TabsTrigger>
          <TabsTrigger value="boards">Boards</TabsTrigger>
          <TabsTrigger value="mediums">Mediums</TabsTrigger>
          <TabsTrigger value="standards">Standards</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="categories">Award categories</TabsTrigger>
          <TabsTrigger value="qr">QR code</TabsTrigger>
          {isAdmin && <TabsTrigger value="access">Users & Roles</TabsTrigger>}
        </TabsList>

        <TabsContent value="branding">
          {organization ? (
            <BrandingSection organization={organization} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Could not load organization settings.</p>
          )}
        </TabsContent>

        <TabsContent value="years">
          <ConfigSection
            table="academic_years"
            title="Academic years"
            description="The active year is the default filter across the app."
            addLabel="Add academic year"
            supportsActiveFlag
            rows={lookups.academicYears as unknown as Record<string, unknown>[]}
            columns={[
              { key: "label", label: "Label" },
              {
                key: "start_date",
                label: "Starts",
                render: (r) => formatDate(r.start_date as string | null),
              },
              {
                key: "end_date",
                label: "Ends",
                render: (r) => formatDate(r.end_date as string | null),
              },
            ]}
            fields={[
              { name: "label", label: "Label", type: "text", required: true, hint: "e.g. 2026-27" },
              { name: "start_date", label: "Start date", type: "date" },
              { name: "end_date", label: "End date", type: "date" },
            ]}
          />
        </TabsContent>

        <TabsContent value="boards">
          <ConfigSection
            table="boards"
            title="Boards"
            description="Education boards — CBSE, State Board, ICSE and any others you add. Schools only; colleges don't carry a board."
            addLabel="Add board"
            rows={lookups.boards as unknown as Record<string, unknown>[]}
            columns={[{ key: "name", label: "Name" }]}
            fields={[
              { name: "name", label: "Name", type: "text", required: true, hint: "e.g. CBSE, State Board" },
            ]}
          />
        </TabsContent>

        <TabsContent value="mediums">
          <ConfigSection
            table="mediums"
            title="Mediums"
            description="Languages of instruction — English, Gujarati, Hindi and any others you add."
            addLabel="Add medium"
            rows={lookups.mediums as unknown as Record<string, unknown>[]}
            columns={[{ key: "name", label: "Name" }]}
            fields={[{ name: "name", label: "Name", type: "text", required: true }]}
          />
        </TabsContent>

        <TabsContent value="standards">
          <ConfigSection
            table="standards"
            title="Standards"
            description="School classes from LKG and UKG through Std 12. The level drives sorting; the label is what appears on screen."
            addLabel="Add standard"
            rows={lookups.standards as unknown as Record<string, unknown>[]}
            columns={[
              { key: "level", label: "Level", align: "right" },
              { key: "label", label: "Label" },
            ]}
            fields={[
              {
                name: "level",
                label: "Level",
                type: "number",
                required: true,
                min: -2,
                max: 12,
                hint: "Use -2 for LKG, -1 for UKG, 1-12 for Std 1-12",
              },
              { name: "label", label: "Label", type: "text", required: true, hint: "e.g. LKG, UKG, Std 10" },
            ]}
          />
        </TabsContent>

        <TabsContent value="courses">
          <ConfigSection
            table="courses"
            title="Courses"
            description="Degrees and diplomas. Structure decides whether students are placed by year or by semester."
            addLabel="Add course"
            rows={lookups.courses as unknown as Record<string, unknown>[]}
            columns={[
              { key: "name", label: "Name" },
              {
                key: "structure_type",
                label: "Structure",
                render: (r) => (
                  <Badge variant="secondary">
                    {r.structure_type === "semester" ? "Semester-based" : "Year-based"}
                  </Badge>
                ),
              },
              { key: "total_periods", label: "Years / semesters", align: "right" },
            ]}
            fields={[
              {
                name: "name",
                label: "Name",
                type: "text",
                required: true,
                hint: "e.g. BTech, MBBS, Diploma",
              },
              {
                name: "structure_type",
                label: "Structure",
                type: "select",
                required: true,
                default: "year",
                options: [
                  { value: "year", label: "Year-based" },
                  { value: "semester", label: "Semester-based" },
                ],
              },
              {
                name: "total_periods",
                label: "Total years / semesters",
                type: "number",
                required: true,
                min: 1,
                max: 12,
                default: "4",
                hint: "e.g. 8 for a semester-based BTech",
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="categories">
          <ConfigSection
            table="award_categories"
            title="Award categories"
            description="Prize tiers — No. 1, No. 2, No. 3, Consolation. Sort order controls how they appear everywhere."
            addLabel="Add category"
            rows={lookups.awardCategories as unknown as Record<string, unknown>[]}
            columns={[
              { key: "sort_order", label: "Order", align: "right" },
              { key: "name", label: "Name" },
            ]}
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              {
                name: "sort_order",
                label: "Sort order",
                type: "number",
                required: true,
                min: 0,
                default: "0",
                hint: "Lower numbers appear first",
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="qr">
          <QrCodeSection />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="access">
            <AccessSection roles={roles} users={users} currentUserId={currentUserId} />
          </TabsContent>
        )}
      </Tabs>

      <div className="rounded-lg border bg-muted/30 p-5">
        <p className="text-[13px] font-semibold">Gift inventory</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Gift items live on their own page because stock levels change constantly during the award
          season. Total stock value:{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(
              lookups.giftItems.reduce(
                (sum, g) => sum + g.quantity_on_hand * Number(g.unit_cost ?? 0),
                0,
              ),
            )}
          </span>
          .
        </p>
      </div>
    </>
  );
}
