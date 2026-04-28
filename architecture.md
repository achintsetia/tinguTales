# TinguTales — Cloud Functions Architecture

All backend logic runs on **Firebase Cloud Functions v2** (region: `asia-south1`).  
Functions are grouped below by their role in the system.

---

## Story Generation Pipeline

This is the core flow. Each step hands off to the next via Firestore status transitions or Cloud Task queues.

```
createChildProfile ──► generateAvatarOnProfileCreate
                                │
generateStoryDraft ─────────────┘
        │ (draft_ready)
approveStoryDraft
        │ (approved)
generateScenes  ◄── Firestore trigger (status → approved)
        │ (generating_images)
enqueuePageImageTask  ◄── Firestore trigger (page doc created)
        │
processPageImage  ◄── Cloud Task queue
        │ (all pages done → creating_pdf)
generateStorybookPdf  ◄── Cloud Task queue
        │ (pdf_ready)
```

### Story Status States

| Status | Meaning |
|---|---|
| `draft_ready` | Story text generated, waiting for user review |
| `approved` | User approved draft, triggers scene generation |
| `generating_scenes` | Scene prompts being created by Gemini |
| `scenes_failed` | Scene generation failed |
| `generating_images` | Page images being generated |
| `creating_pdf` | PDF assembly in progress |
| `pdf_ready` | Complete storybook PDF available |

---

## Functions Reference

### Child Profile

| Function | Trigger | Description |
|---|---|---|
| `createChildProfile` | `onCall` | Creates a child profile document in Firestore with avatar_status `pending` |
| `generateAvatarOnProfileCreate` | `onDocumentCreated` (`child_profiles/{profileId}`) | Automatically generates a cartoon avatar via Gemini Image when a profile is created |
| `retryAvatarGeneration` | `onCall` | Manually retries avatar generation for a profile stuck in `failed` state |
| `deleteChildProfile` | `onCall` | Deletes a child profile |
| `syncUploadUrls` | `onCall` | Repair helper — backfills missing `photo_download_url` on profiles by scanning Storage |
| `transliterateChildName` | `onCall` | Transliterates a child's name from English into an Indian language script using Sarvam AI |

### Story Creation

| Function | Trigger | Description |
|---|---|---|
| `generateStoryDraft` | `onCall` | Uses Gemini to write a complete age-appropriate storybook draft with per-page text, moral, title, and a back-cover lesson sentence. Produces a `draft_ready` story. |
| `approveStoryDraft` | `onCall` | Saves user-edited page texts back to Firestore and sets story status to `approved`, triggering scene generation |
| `generateScenes` | `onDocumentUpdated` (`stories/{storyId}`) | Firestore trigger that fires when status changes to `approved`. Calls the scene pipeline to generate illustration prompts and a character card for every page via Gemini. |
| `retrySceneGeneration` | `onCall` | Retries scene generation for stories stuck in `scenes_failed` |

### Image Generation

| Function | Trigger | Description |
|---|---|---|
| `enqueuePageImageTask` | `onDocumentCreated` (`stories/{storyId}/pages/{pageId}`) | Fires when a page sub-document is created with `status: pending`. Reads story context and dispatches a `processPageImage` Cloud Task. |
| `processPageImage` | `onTaskDispatched` (Cloud Tasks queue) | Generates the illustration for one page using Gemini Image, performs a QA pass with Gemini Flash, composites text overlay with `sharp`, and writes the final JPEG to Cloud Storage. Retries up to 2 times with 60 s backoff. Max 6 concurrent dispatches. |

### PDF Generation

| Function | Trigger | Description |
|---|---|---|
| `generateStorybookPdf` | `onTaskDispatched` (Cloud Tasks queue) | Assembles all page JPEGs into a PDF using `pdf-lib`, uploads to Cloud Storage, and emails the user a download link (unless `skipEmail` is set). |

### Payment

| Function | Trigger | Description |
|---|---|---|
| `createStoryPaymentOrder` | `onCall` | Creates a Razorpay payment order. If payments are disabled in config, returns `requiresPayment: false` and the story proceeds for free. Supports discount coupons. |
| `verifyStoryPayment` | `onCall` | Verifies the Razorpay HMAC signature (using `timingSafeEqual`) and marks the payment as `paid`, unlocking PDF generation. |
| `markStoryPaymentFailed` | `onCall` | Client-side call to record a Razorpay payment failure. |
| `redeemDiscountCoupon` | `onCall` | Atomically checks and decrements `remaining_uses` on a discount coupon inside a Firestore transaction. |

### Refunds

| Function | Trigger | Description |
|---|---|---|
| `submitRefundRequest` | `onCall` | Creates or updates a refund request in `refund_requests`. Sends notification emails to admin and acknowledgment to user. |
| `adminIssueRefund` | `onCall` (admin only) | Calls the Razorpay refunds REST API to issue a refund, then marks the payment and request as `refunded`. |
| `adminCloseRefundRequest` | `onCall` (admin only) | Marks a refund request as `closed` without issuing a financial refund. |

### Admin Operations

| Function | Trigger | Description |
|---|---|---|
| `adminUpdatePageText` | `onCall` (admin only) | Updates the text (and optionally cover title/subtitle) of a single page document |
| `adminRetryPageImage` | `onCall` (admin only) | Re-enqueues a `processPageImage` task for a specific page |
| `adminRetryPdf` | `onCall` (admin only) | Re-enqueues a `generateStorybookPdf` task for a story. Sets status to `creating_pdf`. |
| `adminRetryFailedImageGeneration` | `onCall` (admin only) | Retries image generation from a record in `_failed_image_generation` collection |
| `adminSendCorrectionEmail` | `onCall` (admin only) | Sends the user a corrected storybook email with the current PDF URL |
| `getAdminCostReport` | `onCall` (admin only) | Aggregates `token_consumption` records into a cost report with per-task USD and INR breakdowns |

### Utility

| Function | Trigger | Description |
|---|---|---|
| `getUserUploads` | `onCall` | Lists all files a user has uploaded to `{userId}/uploads/` in Cloud Storage |
| `deleteUserUpload` | `onCall` | Deletes a single upload file from Cloud Storage |
| `deleteStory` | `onCall` | Deletes a story document and its associated pages sub-collection |
| `recordPdfDownload` | `onCall` | Writes a `user_downloaded_pdf` timestamp to the story document |
| `listGeminiModels` | `onCall` | Lists available Gemini models (dev/admin utility) |

---

## Shared Internal Modules

| Module | Purpose |
|---|---|
| `_generateScenesCore.ts` | Core scene-pipeline logic shared by `generateScenes` and `retrySceneGeneration` |
| `_pageImageCore.ts` | Types, prompt builder, QA verifier, and Storage helpers for image generation |
| `_pageTextOverlay.ts` | Renders deterministic text overlays onto page images using `sharp` |
| `_backCoverLessonText.ts` | Builds and normalises the back-cover lesson sentence |
| `_storyPaymentsHelpers.ts` | Razorpay credential loading, price lookup, and shared request types |
| `_adminHelpers.ts` | `assertAdmin()` — verifies the caller's UID against the admin allow-list |
| `geminiConfig.ts` | Gemini client factory, model name constants, and per-task timeout config |
| `tokenConsumption.ts` | Writes token-usage records to `token_consumption/{userId}/usage` |
| `emailService.ts` | Sends transactional emails (PDF ready, refund, correction) |
| `avatarGeneration.ts` | Core avatar generation logic (Gemini Image → JPEG → Storage) |
| `admin.ts` | Firebase Admin SDK singleton exports (`db`, `bucket`, `admin`) |

---

## AI Services

| Service | Models | Used For |
|---|---|---|
| **Google Gemini** | `gemini-2.5-flash` (default) | Story draft generation, scene prompt generation |
| **Google Gemini** | `gemini-2.5-flash-image` (default) | Page illustration generation, avatar generation |
| **Google Gemini** | `gemini-2.0-flash` (default) | Image QA pass after illustration |
| **Sarvam AI** | `sarvam-30b` | Child name transliteration to Indian language scripts |

All Gemini model selections are overridable at runtime via Firestore config keys (`avatar_generation_model`, `story_generation_model`, `story_illustration_model`, `image_qa_model`).

---

## Firestore Collections

| Collection | Contents |
|---|---|
| `child_profiles` | Profile metadata, photo URL, avatar URL, avatar status |
| `stories` | Story metadata, status, character card, page count, moral |
| `stories/{storyId}/pages` | Per-page text, scene prompt, image URL, page type |
| `payments` | Razorpay order/payment IDs, status, amount |
| `refund_requests` | Refund issue description, status, resolution |
| `discount_coupons` | Code, discount percent, remaining uses |
| `token_consumption/{userId}/usage` | Per-task AI token usage records |
| `_failed_image_generation` | Snapshot of failed page-image payloads for admin retry |

---

## Cloud Task Queues

| Queue | Handler | Concurrency / Retry |
|---|---|---|
| `processPageImage` | `processPageImage` function | Max 6 concurrent, 2 retries, 60 s min backoff, 540 s timeout |
| `generateStorybookPdf` | `generateStorybookPdf` function | Default retry, 600 s dispatch deadline |
