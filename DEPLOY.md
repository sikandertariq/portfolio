# Your Portfolio + Admin Page — Setup Guide

This guide is written for **non-coders**. Follow it top to bottom. You only do
this setup **once**. After that, updating your portfolio is just: open your
admin page → fill in a form → click **Publish**.

There are 4 parts:

1. **Try it on your own computer** (optional, no accounts needed)
2. **Put your site online** (GitHub + Vercel)
3. **Turn on the admin login** (one-time, the only fiddly bit)
4. **How you'll add projects from now on**

---

## How this works (30-second version)

- Your website is a folder of files.
- The text and images come from 3 simple files in the `content/` folder.
- The **admin page** (at `yourdomain.com/admin`) gives you a friendly form to
  edit those files — no code, no copy-pasting.
- When you click **Publish**, your changes save and your live site updates
  automatically within a minute or two.

There's **no database** and **nothing to pay for**. 🎉

---

## Part 1 — Try the admin on your own computer (optional)

You can preview the admin before putting anything online. Easiest way:

1. Open **Google Chrome** or **Microsoft Edge** (this trick needs one of those).
2. Make sure the local preview is running. In a Terminal window, inside the
   website folder, run:
   ```
   python3 -m http.server 8080
   ```
3. In Chrome/Edge, go to: **http://localhost:8080/admin/**
4. Click **"Work with Local Repository"** and choose this website's folder.
5. You'll see your **Site Settings**, **Projects**, and **Testimonials** — edit
   away. Changes save directly to the files on your computer.

> This local mode is just for trying things out. To edit from anywhere (and let
> the world see your site), do Parts 2 and 3.

---

## Part 2 — Put your site online (GitHub + Vercel)

### Step 2.1 — Create a free GitHub account
Go to https://github.com and sign up (if you don't already have an account).

### Step 2.2 — Upload your website to GitHub
1. Click the **+** in the top-right of GitHub → **New repository**.
2. **Repository name:** something like `my-portfolio`.
3. Choose **Public** (Private also works on a paid Vercel plan; Public is fine).
4. Click **Create repository**.
5. On the next page, click **"uploading an existing file"**.
6. Drag in **everything inside your website folder** (all the `.html` files,
   the `assets`, `content`, and `admin` folders, etc.).
7. Click **Commit changes**.

📝 **Write down** your repository name in the form `your-username/my-portfolio`.
You'll need it in Part 3.

### Step 2.3 — Deploy on Vercel
1. Go to https://vercel.com and click **Sign Up** → **Continue with GitHub**.
2. Click **Add New… → Project**.
3. Find your `my-portfolio` repository and click **Import**.
4. Leave all settings as their defaults (it's a plain website, no build needed).
5. Click **Deploy**.
6. After a minute you'll get a live address like
   `https://my-portfolio-xxxx.vercel.app`. **That's your live website!** 🎉

📝 **Write down** your live web address. You'll need it in Part 3.

---

## Part 3 — Turn on the admin login (one-time)

Your admin page needs a secure "login" so only **you** can edit. We use a free
Cloudflare helper for this. It's about 10 minutes of clicking. Take it slow.

### Step 3.1 — Deploy the login helper
1. Go to https://github.com/sveltia/sveltia-cms-auth
2. Click the **"Deploy to Cloudflare"** button in that page.
3. Sign up for a **free Cloudflare account** when prompted, and finish the deploy.
4. When it's done, Cloudflare shows you a **Worker URL** that looks like:
   `https://sveltia-cms-auth.YOUR-NAME.workers.dev`

📝 **Write down** this Worker URL.

### Step 3.2 — Register a GitHub login app
1. Go to https://github.com/settings/applications/new
2. Fill in:
   - **Application name:** `Portfolio Admin Login`
   - **Homepage URL:** `https://github.com/sveltia/sveltia-cms-auth`
   - **Authorization callback URL:** your Worker URL **with `/callback` added**,
     e.g. `https://sveltia-cms-auth.YOUR-NAME.workers.dev/callback`
3. Click **Register application**.
4. On the next screen, copy the **Client ID**.
5. Click **Generate a new client secret** and copy the **Client Secret**
   (you can only see it once — copy it now).

### Step 3.3 — Give the helper your login keys
1. Back in **Cloudflare**, open your Worker → **Settings** → **Variables**.
2. Add these (click **Add variable** for each):
   - `GITHUB_CLIENT_ID` = the Client ID from Step 3.2
   - `GITHUB_CLIENT_SECRET` = the Client Secret from Step 3.2 (click **Encrypt**)
   - `ALLOWED_DOMAINS` = your Vercel address **without** `https://`,
     e.g. `my-portfolio-xxxx.vercel.app`
3. Click **Save and Deploy**.

### Step 3.4 — Tell your site where to log in
Open the file **`admin/config.yml`** on GitHub (click it, then the pencil ✏️ to
edit) and change these two lines near the top:

```yaml
  repo: YOUR-GITHUB-USERNAME/YOUR-REPO-NAME        # e.g. janedoe/my-portfolio
  base_url: https://YOUR-LOGIN-WORKER-URL          # your Worker URL from Step 3.1
```

So they look like (example):

```yaml
  repo: janedoe/my-portfolio
  base_url: https://sveltia-cms-auth.jane.workers.dev
```

Click **Commit changes**. Vercel will re-publish automatically.

✅ **Done!** Go to `https://your-vercel-address/admin/`, click **Login with
GitHub**, and you're in.

---

## Part 4 — How you'll add a project from now on

1. Go to `https://your-vercel-address/admin/` and log in.
2. Click **Projects** → **All Projects**.
3. Click **➕ Add Project** (or edit/reorder existing ones).
4. Fill in the form: title, description, upload images, etc.
5. Click **Publish** (top of the page).
6. Wait ~1 minute — your live site updates itself. That's it!

### A few tips
- **Web Address Slug** (on a project): keep it lowercase with dashes and no
  spaces, e.g. `customer-service-guide`. It becomes part of the project's link.
- **Bold text:** in description boxes you can wrap words like
  `<strong>this</strong>` to make them bold.
- **Feature on homepage?**: turn this on for the one project you want spotlighted
  on your home page.
- **Images:** click the image field → **Upload** → pick a file from your computer.

---

## If something doesn't work
- **"Not authorized" on login:** double-check `ALLOWED_DOMAINS` in Cloudflare
  matches your Vercel address exactly (no `https://`, no trailing `/`).
- **Login popup closes and nothing happens:** re-check the
  **Authorization callback URL** in your GitHub app ends in `/callback`.
- **Changes don't show on the live site:** give it 1–2 minutes; Vercel
  re-publishes after each Publish.

---

## Technical notes (for any developer who helps you later)
- Static site, no build step. Content lives in `content/*.json`, loaded at
  runtime by `app.js` via `fetch()`.
- Admin is **Sveltia CMS** (`admin/index.html` + `admin/config.yml`), a
  Git-based CMS that commits straight to the repo. No database/server.
- `projects.json` and `testimonials.json` are rooted under `projects` /
  `testimonials` keys so the CMS list widgets can edit them.
- OAuth via the `sveltia-cms-auth` Cloudflare Worker; `base_url` in `config.yml`
  points at it. Hosting is Vercel (any static host works).
