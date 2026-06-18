# Maya Mart – Setup & Deployment Guide

## Folder Structure

```
maya-mart/
├── index.html          ← Main website
├── manifest.json       ← PWA manifest
├── service-worker.js   ← Offline support
├── vercel.json         ← Vercel config
├── css/
│   └── style.css       ← All styles
├── js/
│   ├── app.js          ← All logic
│   └── sw-register.js  ← SW registration
└── icons/
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-192.png
    └── icon-512.png    ← PWA icons (basket/cart logo on green bg)
```

---

## Step 1: Google Sheet Setup

1. Open your Google Sheet
2. Click **Share** → Set to **"Anyone with the link"** → **Viewer**
3. Go to **File → Share → Publish to web**
4. Choose **"Entire Document"** → **CSV** → Click **Publish**
5. Copy the published URL (looks like: `https://docs.google.com/spreadsheets/d/YOUR_ID/pub?output=csv`)

### Required Sheet Columns (exact names):
| Column | Example |
|--------|---------|
| id | 35021 |
| title | EVEREST MEAT MASALA |
| description | Premium meat masala blend |
| price | 5 |
| sale_price | 5 |
| availability | IN STOCK |
| image_link | https://... |
| barcode | 8901234567890 |
| show_on_website | TRUE |

> Products only show when `show_on_website = TRUE` and `image_link` is filled.

---

## Step 2: Generate PWA Icons

Go to https://realfavicongenerator.net or https://maskable.app  
Upload a 512×512 PNG of your logo (green background, white basket icon)  
Download all sizes → paste into `/icons/` folder

---

## Step 3: Deploy to Vercel

### Option A: Drag & Drop
1. Go to https://vercel.com
2. Sign up / Log in
3. Click **"Add New Project"**
4. Drag the entire `maya-mart` folder
5. Click **Deploy**

### Option B: GitHub (recommended for updates)
1. Create GitHub repo: `maya-mart`
2. Upload all files
3. Connect repo to Vercel
4. Auto-deploys on every push

---

## Step 4: Custom Domain

1. Buy `.in` domain (GoDaddy / Namecheap / Google Domains)
2. In Vercel dashboard → **Domains** → Add your domain
3. Update DNS records as shown by Vercel

---

## Owner Instructions (No Coding Required)

### To add a product:
1. Open Google Sheet
2. Add new row with all columns filled
3. Set `show_on_website = TRUE`
4. Set `image_link` to product image URL
5. Website updates automatically within minutes

### To remove/hide a product:
- Change `show_on_website` to `FALSE`

### To change price:
- Edit the `price` or `sale_price` column

### To mark out of stock:
- Change `availability` to `OUT OF STOCK`

---

## Image Hosting Tips

Free options for product images:
- **ImgBB**: https://imgbb.com (free, permanent)
- **Cloudinary**: https://cloudinary.com (free tier 25GB)
- **Google Drive**: Share image → Get link → Convert to direct URL

To convert Google Drive image to direct URL:
`https://drive.google.com/file/d/FILE_ID/view` 
→ `https://drive.google.com/uc?export=view&id=FILE_ID`

---

## WhatsApp Order Flow

Customer fills cart → clicks "Place Order" → fills name/phone/address → WhatsApp opens with pre-filled order message → store confirms and delivers.

**Store WhatsApp:** 9278224984  
**Store Phone:** 9278224984

---

## Support

Website built for: **Amar Gupta, Maya Mart**  
Technology: HTML5 + CSS3 + Vanilla JavaScript + Google Sheets  
Hosting: Vercel (free tier)
