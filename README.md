# Bernard & Roselyn Wedding Website

A static wedding website for Bernard Benson & Roselyn Marilla's wedding on May 18, 2026.

## Features

- **Home Page**: Hero section with countdown timer to the wedding day
- **Our Story**: Timeline of the couple's journey together
- **Wedding Party**: Meet the bridesmaids and groomsmen
- **Schedule**: Ceremony and reception details with venue map
- **Photos**: Responsive photo gallery with lightbox viewer
- **RSVP**: Form that submits to Google Sheets
- **Admin Dashboard**: Password-protected RSVP viewer with statistics

## Tech Stack

- Pure HTML5, CSS3, JavaScript (no frameworks)
- Google Fonts (Great Vibes, Cormorant Garamond, Montserrat)
- Google Sheets + Apps Script for RSVP data storage
- GitHub Pages for hosting

## Project Structure

```
wedding/
├── index.html              # Home page with hero & countdown
├── our-story.html          # Couple's story timeline
├── wedding-party.html      # Bridesmaids & groomsmen
├── schedule.html           # Ceremony & reception details
├── photos.html             # Photo gallery
├── rsvp.html               # RSVP form
├── admin.html              # Password-protected RSVP viewer
├── css/
│   └── styles.css          # All styles
├── js/
│   ├── main.js             # Countdown, navigation, animations
│   ├── rsvp.js             # Form handling & Google Sheets submission
│   ├── admin.js            # Admin authentication & dashboard
│   └── gallery.js          # Photo lightbox
├── images/
│   ├── hero/               # Hero background images
│   ├── couple/             # Bernard & Roselyn photos
│   ├── wedding-party/      # Bridesmaids/groomsmen photos
│   ├── gallery/            # Photo gallery images
│   └── qr-code.png         # QR code to site
└── README.md
```

## Setup Instructions

### 1. Add Your Images

Place your images in the appropriate folders:

- `images/hero/hero-bg.jpg` - Hero background image
- `images/couple/` - Photos for the Our Story timeline
- `images/wedding-party/` - Photos of bridesmaids and groomsmen
- `images/gallery/` - Photos for the gallery

### 2. Configure Google Sheets Integration

To enable RSVP form submissions:

1. Create a new Google Sheet with these columns:
   - Timestamp, Name, Email, Attending, NumberOfGuests, DietaryRestrictions, Message

2. Go to Extensions > Apps Script and paste this code:

```javascript
const SHEET_NAME = 'Sheet1';
const ADMIN_PASSWORD = ''; // Change this!

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.name,
      data.email,
      data.attending,
      data.guests || '0',
      data.dietary || '',
      data.message || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const password = e.parameter.password;

  if (password !== ADMIN_PASSWORD) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Invalid password' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rsvps = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      rsvps.push({
        timestamp: row[0],
        name: row[1],
        email: row[2],
        attending: row[3],
        guests: row[4],
        dietary: row[5],
        message: row[6]
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ rsvps }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Deploy as Web App:
   - Click Deploy > New deployment
   - Select "Web app"
   - Execute as: "Me"
   - Who has access: "Anyone"
   - Click Deploy and copy the URL

4. Update the website:
   - Open `js/rsvp.js` and replace `YOUR_GOOGLE_APPS_SCRIPT_URL_HERE` with your URL
   - Open `js/admin.js` and replace `YOUR_GOOGLE_APPS_SCRIPT_URL_HERE` with your URL
   - Update `ADMIN_PASSWORD` in both files to match your Apps Script password

### 3. Customize Content

- Edit the HTML files to update names, dates, and text content
- Update wedding party member names and photos
- Modify the timeline events in `our-story.html`
- Add your venue address to `schedule.html`

### 4. Deploy to GitHub Pages

#### Initial Setup

1. **Create a GitHub repository:**
   - Go to [github.com](https://github.com) and sign in
   - Click the "+" icon in the top right, then "New repository"
   - Name it (e.g., `wedding` or `bernard-roselyn-wedding`)
   - Keep it public (required for free GitHub Pages) or use GitHub Pro for private repos
   - Don't initialize with README (you already have one)

2. **Push your code to GitHub:**
   ```bash
   # If this is a new repo, initialize git
   git init
   git add .
   git commit -m "Initial commit"

   # Add the remote and push
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

3. **Enable GitHub Pages:**
   - Go to your repository on GitHub
   - Click **Settings** (gear icon)
   - Scroll down to **Pages** in the left sidebar
   - Under **Source**, select **Deploy from a branch**
   - Under **Branch**, select `main` and `/ (root)`
   - Click **Save**

4. **Access your site:**
   - Wait 1-2 minutes for the initial deployment
   - Your site will be live at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`
   - Check the **Actions** tab to monitor deployment status

#### Updating Your Site

After making changes locally:
```bash
git add .
git commit -m "Update wedding details"
git push
```
Changes typically go live within 1-2 minutes.

### 5. Connect a Custom Domain (Optional)

If you purchase a custom domain (e.g., `bernardandroselyn.com`):

#### Step 1: Configure GitHub Pages

1. Go to your repository **Settings** > **Pages**
2. Under **Custom domain**, enter your domain (e.g., `bernardandroselyn.com` or `www.bernardandroselyn.com`)
3. Click **Save**
4. Check **Enforce HTTPS** (may take a few minutes to become available)

This automatically creates a `CNAME` file in your repository.

#### Step 2: Configure DNS at Your Domain Registrar

Log into your domain registrar (GoDaddy, Namecheap, Google Domains, Cloudflare, etc.) and configure DNS:

**Option A: Apex domain (bernardandroselyn.com)**

Add these `A` records pointing to GitHub's IP addresses:

| Type | Name | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

**Option B: Subdomain (www.bernardandroselyn.com)**

Add a `CNAME` record:

| Type | Name | Value |
|------|------|-------|
| CNAME | www | YOUR_USERNAME.github.io |

**Option C: Both apex and www (Recommended)**

Set up both so visitors can use either:

| Type | Name | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | YOUR_USERNAME.github.io |

#### Step 3: Verify Configuration

1. DNS changes can take 24-48 hours to propagate (usually much faster)
2. Check status at **Settings** > **Pages** - it will show a green checkmark when ready
3. Visit your domain to confirm it's working
4. HTTPS certificate is automatically provisioned by GitHub (may take up to 24 hours)

#### Troubleshooting Custom Domains

- **"Domain not properly configured"**: DNS hasn't propagated yet; wait and try again
- **HTTPS not available**: Wait up to 24 hours after DNS propagation
- **Certificate errors**: Ensure CNAME file exists and matches your custom domain setting
- **Use [dnschecker.org](https://dnschecker.org)** to verify your DNS records have propagated

### 6. Generate QR Code

After deployment:
1. Go to a QR code generator (e.g., QR Code Monkey)
2. Enter your live site URL
3. Customize colors to match the wedding theme
4. Download and save as `images/qr-code.png`

## Admin Access

The admin dashboard is at `/admin.html`

Default password: `wedding2026`

**Important:** Change the password in both `js/admin.js` and your Google Apps Script before going live.

## Color Palette

- Primary Background: `#FAF9F6` (cream)
- Primary Accent: `#8B9A7B` (sage green)
- Light Accent: `#9CAF88` (light sage)
- Text Color: `#2C3E2D` (dark green)
- White: `#FFFFFF`

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## License

This project is for personal use for Bernard & Roselyn's wedding.
