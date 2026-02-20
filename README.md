# ENT Endoscopy Report System

A comprehensive, web-based application designed for ENT clinics to generate, preview, and print professional Nasal and Laryngeal Endoscopy reports. This application is built as a **Progressive Web App (PWA)**, allowing it to be installed on devices and used offline.

## 🚀 Key Features

*   **Report Generation:** Specialized forms for **Nasal Endoscopy** and **Laryngeal Endoscopy** with standard medical fields.
*   **PDF Export & Printing:**
    *   Generate high-quality PDF reports with custom headers and layouts.
    *   Native browser print support.
*   **Image Management:**
    *   Upload multiple images per report.
    *   **Built-in Image Cropper:** Crop and adjust images before adding them to the report.
    *   **Video-to-Image:** Extract frames directly from video files to use as report images. (**Note:** This feature requires specific server headers and may not work on all free hosting platforms. See Deployment section.)
*   **Customizable Settings:**
    *   Configure Clinic Name, Address, and Logos (Left/Right).
    *   Manage Attending Physicians list.
    *   Customize header fonts and styling.
    *   Choose between default hospital templates (e.g., Rever Medical Center, Capitol University Medical Center).
*   **Progressive Web App (PWA):**
    *   Installable on Desktop (Windows/Mac) and Mobile (Android/iOS).
    *   Works offline once cached.
*   **User Experience:**
    *   **Dark Mode** support.
    *   **Auto-Save:** Form data is automatically saved to LocalStorage to prevent data loss.
    *   Interactive Tutorial mode.

## 🛠️ Technologies Used

*   **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
*   **Libraries:**
    *   [jsPDF](https://github.com/parallax/jsPDF) - For PDF generation.
    *   [html2canvas](https://html2canvas.hertzen.com/) - For rendering HTML to canvas for PDF export.
    *   [Cropper.js](https://github.com/fengyuanchen/cropperjs) - For image cropping functionality.
    *   [FFmpeg.wasm](https://ffmpegwasm.github.io/) - For in-browser video processing.

## 📦 Installation & Deployment

### Running Locally (for Development)
Because this application uses advanced features, it must be served via a local web server.

1.  **Open the project folder in VS Code.**
3.  **Install the "Live Server" extension** by Ritwick Dey.
3.  Right-click on `index.html` and select **"Open with Live Server"**.

### Deploying to the Web

You can deploy this project to any static site hosting service. Here are instructions for two popular free options.

#### Option 1: Netlify (Recommended for Full Feature Support)
Netlify is recommended because it allows setting the necessary security headers for the **Video-to-Image** feature to work correctly online.

1.  Make sure you have a `netlify.toml` file in your project root with the following content:
    ```toml
    [[headers]]
      for = "/*"
      [headers.values]
        Cross-Origin-Opener-Policy = "same-origin"
        Cross-Origin-Embedder-Policy = "require-corp"
    ```
2.  Go to app.netlify.com and log in.
3.  Drag and drop your entire project folder into the "Sites" dashboard.
4.  Netlify will upload your files and provide you with a live URL.

#### Option 2: GitHub Pages
GitHub Pages is a great, simple option. However, it **does not support the security headers required for the Video-to-Image feature**, so that specific function will not work when deployed here. All other features will work perfectly.

1.  **Create a new repository** on your GitHub account.
2.  **Upload all your project files** to this new repository.
3.  In your repository, go to **Settings > Pages**.
4.  Under "Build and deployment", select the **Source** as "Deploy from a branch".
5.  Choose your main branch (e.g., `main` or `master`) and the folder as `/ (root)`. Click **Save**.
6.  GitHub will build and deploy your site. It will be available at `https://<your-username>.github.io/<your-repository-name>/`.

### Installing as an App (PWA)
1.  Open the deployed application link in a supported browser (Chrome, Edge, Brave).
2.  **Desktop/Android:** Click the **"⬇️ Install App"** button in the header or accept the installation prompt.
3.  **iOS (iPhone/iPad):** Tap the **Share** button (📤) in Safari, scroll down, and select **"Add to Home Screen"** (➕).

## 📂 Project Structure

```text
├── css/
│   └── lib/            # Third-party CSS (Cropper.js)
├── image/              # Icons and default logos
├── js/
│   └── lib/            # Third-party JS libraries (jsPDF, html2canvas, Cropper)
├── index.html          # Main Dashboard
├── nasalEndoscopy.html # Nasal Report Form
├── laryngealEndoscopy.html # Laryngeal Report Form
├── Settings.html       # Clinic Configuration
├── style/
│   └── index.css       # Global Styles
├── function/
│   └── index.js        # Main Application Logic
├── manifest.json       # PWA Manifest
└── sw.js               # Service Worker for Offline Support
