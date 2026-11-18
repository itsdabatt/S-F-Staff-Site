# Smithers & Friends Staff & Volunteer Hub

This repository contains a mobile-friendly website for **Smithers & Friends Community Group, Inc.** with an easy volunteer signup and a password-protected staff workspace.

## Features
- Public list of upcoming events and volunteer roles, full station instructions, and no-login volunteer registration
- Staff login through Supabase Auth (not a fake browser password)
- Create events and volunteer roles; publish/unpublish events
- See private volunteer signups
- Log preparation notes, station reports, volunteer/attendance counts, supply use, expenses, follow-ups, and grant outcomes
- Export event records as CSV
- Responsive layout that works on phones and computers

## First-time setup (about 15–30 minutes)
1. Create a free project at https://supabase.com and save the database password somewhere safe. Do **not** commit it to GitHub.
2. In the Supabase **SQL Editor**, paste the entire contents of `supabase.sql` and run it.
3. Find the **Project URL** and **publishable/anon key** in the Supabase project settings. Edit `config.js` in this repository with those two public values. **Never paste a service_role, secret key, or database password into GitHub.**
4. In Supabase **Authentication > Users**, invite/create a user for yourself and one for Katherine, with separate emails and passwords. Turn off public signup in authentication settings so strangers cannot register as staff.
5. Copy each user's UUID. In the **SQL Editor**, execute an `insert into public.staff_members ...` statement using each person's UUID and display name. Two examples:
   ```sql
   insert into public.staff_members (user_id, display_name, role)
   values ('YOUR-AUTH-USER-UUID','Your Name','admin');
   insert into public.staff_members (user_id, display_name, role)
   values ('KATHERINE-AUTH-USER-UUID','Katherine McGraw','admin');
   ```
   Only authorized people added to staff_members may see private records.
6. In GitHub open **Settings > Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then **main**, **/(root)**, and save.
7. The Pages address should be: **https://itsdabatt.github.io/S-F-Staff-Site/**. GitHub Pages may take a little while to publish. Open it, sign in, add an event and roles, then click **Publish event**.
8. Test a signup and check that it appears in the staff dashboard.

## How to change the site
On GitHub, open a file and click the pencil icon to edit it, then commit. `index.html` holds the design and site behavior, `config.js` holds the public database connection, and `supabase.sql` is the initial database setup.

## Important privacy and limitations
- This GitHub repo is **public**. Never upload volunteer spreadsheets, signed forms, passwords, private notes, or identifiable family information to this repo.
- Volunteer names, emails and phones are stored in Supabase and readable only by approved staff through RLS.
- There is **no staff self-registration**. Use Supabase Auth and add approved account UUIDs to the staff_members table.
- Volunteer capacity is validated by the database trigger, which prevents overbooking. Public UI displays the total role capacity rather than live remaining vacancies.
- This is a working starter version, not yet a full production document archive. Signed forms, file uploads, role editing, volunteer check-in/out, and printable grant reports should be added later with protected storage and access controls.
- Consider a CAPTCHA, rate limits, and a volunteer privacy notice before widely sharing the signup form; open public forms can attract spam.
- Back up records from Supabase periodically. CSV exports are available for event logs.

Questions about the organization: https://smithersandfriends.org


## Family texting center (new module)

A staff-only Wiggle Days Family Texting Center was added at `/family-texting/`. It includes family contacts, recorded SMS permission, select-all/uncheck announcement tools, private reply threads and message history. The sender and webhook code are stored in `supabase/functions/` for later activation with a separate approved S&F texting number. **Live SMS is not active yet.** The main `config.js` still needs a real Supabase project, the `family-texting/database.sql` migration must be run, and the SMS gateway must be registered and tested. See [the module setup guide](family-texting/README.md). Never commit real parent contact information or provider credentials to the public repository.
