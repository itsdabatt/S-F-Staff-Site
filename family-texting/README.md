# Smithers & Friends — Wiggle Days Family Texting Center

This is an **integrated website module**, not a standalone SMS carrier or a paid subscription product. It is meant to become part of the S&F all-in-one staff site. The app is responsive: staff can use a PC, laptop or phone browser.

## Current installation status

- **Yes:** Staff-only screen built in `family-texting/index.html` and `app.js`.
- **Yes:** Add/edit families, consent source, CSV import/export, checkboxes, select-all/clear, announcement composer, per-family inbox and delivery history are implemented.
- **Yes:** Secure SMS sender and signed Twilio inbound webhook code are included in `supabase/functions/`.
- **Not yet:** Existing Supabase project is configured. The repository's `config.js` presently contains placeholder values.
- **Not yet:** Family database SQL is executed, staff accounts are created and verified, or Edge Functions are deployed.
- **Not yet:** S&F owns a registered, approved SMS number; Twilio has been connected; real SMS has been tested.
- **Not free:** SMS delivery, dedicated number rental, provider registration and carrier fees may apply. Hosting and code can remain free-tier depending on usage.

**Do not upload real parent phone numbers, signed forms, message logs or SMS provider secrets to GitHub.** This is a public repository; real records belong ONLY in private Supabase tables.

## What the staff should see when fully activated

1. **Families:** Add a parent/guardian name and cell number; record opt-in and exactly where permission was given; import an existing consent-verified CSV; archive old records.
2. **Send announcement:** Select every eligible family, or uncheck a few. Compose one message. The provider sends a **separate SMS to each checked number** (NOT a group MMS), from S&F's own number.
3. **Private replies:** Parents reply in their usual text-message app, without signing up for anything. Each parent has a private, separate thread in the dashboard.
4. **History:** Staff can see accepted/sent/delivered/failed statuses and export an internal history CSV.

## One-time activation work (required)

1. Follow the repository root `README.md` to configure its existing Supabase project and create staff login accounts for authorized S&F personnel. The site uses `../config.js` and the same Supabase staff login as the rest of the Staff Site. **Keep service-role and SMS API secrets off GitHub.**
2. In the Supabase SQL Editor, run the root `supabase.sql` (if not already done) and then this module's `family-texting/database.sql`.
3. Obtain a dedicated S&F SMS number from a legitimate provider, register the organization and messaging use case, and provide opt-in proof. The ready-to-configure adapter currently targets **Twilio**. Provider fees and U.S. sender registration requirements apply.
4. Deploy the functions:
   ```bash
   supabase login
   supabase link --project-ref YOUR_REAL_PROJECT_REF
   supabase functions deploy snf-send-sms
   supabase functions deploy snf-twilio-webhook --no-verify-jwt
   ```
   Only the webhook allows unauthenticated HTTP because **it verifies Twilio's cryptographic signature**. The sender requires a signed-in staff user.
5. Set **Supabase Edge Function secrets**, not browser config:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_MESSAGING_SERVICE_SID` **or** `TWILIO_FROM_NUMBER`
   - `TWILIO_WEBHOOK_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/snf-twilio-webhook`
   - `ALLOWED_ORIGIN=https://itsdabatt.github.io`
   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions; verify your deployment environment. Restrict that key to the server only.
6. In the SMS provider console, set the approved phone number's incoming SMS webhook (HTTP POST) to the **exact** URL above and configure outbound status callbacks. If using a Messaging Service, confirm its sender selection and opt-out forwarding settings.
7. Check that your GitHub Pages deployment is active. Open **https://itsdabatt.github.io/S-F-Staff-Site/family-texting/**. The current app will show a setup message until Supabase is configured. When configured, use your staff account to sign in.
8. With **two consenting test numbers only**, send a short test to both numbers. Verify each receives a regular SMS, each replies separately, each reply reaches the correct conversation, and STOP prevents a later send. Check carrier and provider logs. **Do not bulk-send to parents until these tests pass.**

## Parent opt-in wording (on the orange signup sheet / parent sheet)

**Optional text updates:** [ ] Yes, I agree to receive occasional Wiggle Days SMS reminders and program updates from Smithers & Friends Community Group, Inc. at the mobile number I provided. Approximately 2–3 texts/month, frequency may vary. Message and data rates may apply. I can reply STOP to opt out and HELP for help. This is optional and not required to attend. See the organization's privacy policy and contact details.

The signup must be an **unchecked opt-in**. Staff must retain evidence of when/how permission was given. A phone number provided for check-in or emergency contact **alone does not equal permission to send promotional messages**. Keep photography permission separate. Publish an accurate family SMS privacy policy and consent disclosures before registration; review them against the chosen provider's requirements.

## Privacy & security

- This module stores only adult contact information and SMS discussion, not private child records. Do not enter medical histories, children's names with private details, or emergency situations into the texting inbox.
- Staff access is limited by Supabase authentication + RLS. Enable MFA, limit staff to people who need access, and periodically export/back up records securely.
- Send functions re-check consent on the server before messaging, enforce a daily safety cap, and use per-campaign idempotency records to reduce duplicate sends.
- Import cannot undo STOP. After a parent replies STOP, the inbound webhook records opt-out. Carrier-level STOP enforcement must also be configured and tested; do not assume the webhook alone is sufficient.
- A recorded opt-in with a source does not guarantee legal compliance. Review provider requirements and applicable laws before launching a recurring texting program.
- The front-end can be moved to a future S&F site; transfer the private Supabase backend and SMS function connections separately. Nothing forces families to install a new app.

## Suggested first Wiggle Days text

```
Winter Wonderland in Wiggle World is Saturday, December 12 at Montgomery Public Library. Check-in begins at 12:30 PM; activities 1–3 PM. Questions? Reply to this text!
```

The sender adds `Smithers & Friends:` and `Reply STOP to opt out.` automatically, which may increase SMS segment usage.

Questions/organizational contact: directoratlarge@smithersandfriends.org
