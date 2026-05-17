# Phase 2d backlog — admin read-side parity + write-side cleanup

Discovered during Stage 2b-3 sub-stage 2.5 (admin pipeline applicant detail
view Phase 2 data display fix). The 2.5 hotfix unblocks the most-visible
read-side gaps (Personal, Documents, Academic). The items below are
deferred to Phase 2d for a focused, separately-reviewable pass.

## Write-side bugs (FE/BE field-name mismatches in submit handler)

The pattern across all three: "FE sends field X, BE persists field Y, no
error because Prisma silently leaves the unmatched value out." Audit
pass should sweep all Phase 2 write paths for similar mismatches.

1. **ApplicantEducation.yearOfCompletion is null for every Phase 2 row.**
   Submit handler at `server/src/routes/public.js` reads
   `e.yearOfCompletion` from incoming education entries, but Step 3
   (`client/src/pages/public/ApplyStart.jsx`) sends `e.yearOfPassing`.
   The Number-coercion fallback finds nothing → `null` is persisted.
   The original value survives only in `formData._public.educationEntries[].yearOfPassing`.

2. **ApplicantEducation is missing columns for `institutionName`,
   `percentageOrGrade`, `languageOfInstruction`.** Step 3 collects all
   three and the submit handler quietly drops them at the column-mapping
   stage; they survive only in `formData._public.educationEntries[]`.
   Schema additions needed (all nullable String for back-compat).

3. **ApplicantLanguage has all three skill booleans persisted as `false`
   for every Phase 2 row.** Submit handler reads `l.canSpeak`,
   `l.canRead`, `l.canWrite` but Step 3 sends `readWrite`, `speak`,
   `understand`. None match → all three columns default to `false`. The
   original values survive only in `formData._public.languages[]`.
   Note: there is no column for "understand" at all — needs a schema
   addition if the four-state model is canonicalised.

## Read-side remaining work (admin pipeline detail view)

`client/src/pages/admissions/ApplicantProfile.jsx`:

4. **Spiritual tab** — expand from 1 field (`statementOfFaith`) to
   approximately 12 fields: `waterBaptism` (Yes/No), `waterBaptismWhen`
   (a.k.a. `baptismDate`), `baptismLocation`, `churchName`, `pastorName`,
   `yearsAtCurrentChurch`, `previousChurches`, `spiritualGifts`,
   `ministryInvolvement`, `whyHmc`, `futureMinistryPlans`,
   `churchDenomination`/`churchAddress`/`pastorAddress`,
   `holySpiritInfilling`, `callForMinistry`. Data already in
   `formData.*` and individual Applicant columns; `flatten()` needs to
   surface them.

5. **Background/Family section** — new tab (or fold into Personal).
   Seven fields collected at Step 3: `fatherName`, `fatherOccupation`,
   `motherName`, `motherOccupation`, `numberOfSiblings`,
   `familyChurchAffiliation`, `familyChristianBackground`. Already in
   `formData._public.*`; `flatten()` needs to surface them.

6. **Financial section** — new tab. Step 5 fields:
   `paymentMethod`, `commitTwoHoursDaily`, `feeResponsibility`,
   `needsFinancialAid`, `financialAidNote`, plus the sponsor block
   (`sponsoredByOrg`, `sponsorName`, `sponsorDetails`, `sponsorContact`,
   `sponsorEmail`). Also surface sub-stage 2's payment columns:
   `paymentStatus`, `paymentStatusUpdatedAt`, `paymentReceiptUrl`.
   Roughly 10–13 fields total.

7. **Signed-URL document download.** Documents tab currently shows
   metadata only. The existing `minioService.getReadUrl()` already
   returns short-lived signed URLs — needs a small endpoint
   (e.g. `GET /admissions/:id/documents/:docId/url`) plus a clickable
   link/Download button on each doc row.

8. **Modal width.** The current 600px-wide drawer is cramped now that
   Personal expanded to ~20 fields and Academic shows full cards. A
   drawer widening (to e.g. 800–900px) or a dedicated full-page detail
   view would relieve scroll fatigue.

9. **`flatten()` → `flatten()` + `flattenDetail()` split.** The list
   endpoint and the detail endpoint share a single `flatten()` helper.
   If the detail-tier shape keeps growing, factor out a richer
   `flattenDetail()` so the list payload stays lean.

## UX polish (applicant-facing public flow)

10. **`/apply/continue` with a submitted draft** — currently returns the
    generic 404 "We couldn't find an application matching that code and
    email" because the backend's `loadDraftForAccess` treats a draft
    bound to a submitted Applicant as inaccessible. The draft does
    exist; the message is misleading. Polish: detect the submitted
    state (the existing `Applicant.draftId @unique` FK reveals it via
    `draft.applicant`) and return either
    (a) a distinct error: "This application has already been submitted.
        Check status at /apply/status with your application number
        HMC-APP-XXXX." (includes the `applicationNo` so the applicant
        can self-serve), or
    (b) include `applicationNo` in the response and have the FE redirect
        to `/apply/status?applicationNo=…`.
    Both options reveal whether a draft is submitted — a small
    information leak. Judgment call on whether the UX gain justifies
    it. Discussion-worthy in the audit pass.

11. **`/apply` landing page discoverability** — verify the public
    landing has visible "Continue Application" and "Check Status" links
    so applicants who haven't bookmarked the pages can find them.
    Currently uncertain whether these links exist on the landing page;
    Step 0 (StepIntro) of `/apply/start` has the "Already started?
    Continue your application" link but `/apply` itself (`ApplyPage.jsx`)
    may not. Fix if missing.

## Endpoint consolidation

After the `/status` extension in sub-stage 3 (Day 5), `/payment-status` is
now a subset of `/status`. Consider deprecating `/payment-status` and
migrating `ApplyPayment.jsx` to `/status` in a future cleanup. Both work
currently; the smaller payment-status shape isn't wasteful, but maintaining
two endpoints that return overlapping data is a maintenance burden the
audit pass should evaluate.

## Pattern note for the fresh audit pass

The write-side bugs above (#1–#3) share a single root cause: the FE
form-field naming on Step 3 (and possibly other steps) was authored
independently of the Prisma column naming, and the submit handler
mediates with literal property reads (`e.fieldName`, `l.flagName`) that
silently fail to match.

The audit should:
- Diff each Phase 2 step's form field names against the columns the
  submit handler writes into.
- For each mismatch, either rename one side or add an explicit mapping
  layer in the submit handler (the current implicit-match approach
  fails silently).
- Spot-check other relation-table writes (Documents, References, etc.)
  for the same shape.
