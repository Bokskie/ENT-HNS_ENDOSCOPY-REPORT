document.addEventListener('DOMContentLoaded', async (event) => {
    // NEW: Store cleared data for Undo functionality
    let lastClearedData = null;

    // ===================================================================================
    // SERVICE WORKER REGISTRATION FOR OFFLINE CAPABILITY
    // ===================================================================================
    if ('serviceWorker' in navigator) {
        // Inject Toast HTML dynamically
        const toastDiv = document.createElement('div');
        toastDiv.id = 'updateToast';
        toastDiv.className = 'update-toast';
        toastDiv.style.display = 'none';
        toastDiv.innerHTML = `
            <div class="toast-content">
                <span>New update available!</span>
                <div style="display: flex; gap: 10px;">
                    <button id="reloadBtn">Update Now</button>
                    <button id="dismissUpdateBtn" class="btn-secondary">Dismiss</button>
                </div>
            </div>
        `;
        document.body.appendChild(toastDiv);

        function showUpdateToast(worker) {
            const toast = document.getElementById('updateToast');
            const reloadBtn = document.getElementById('reloadBtn');
            const dismissBtn = document.getElementById('dismissUpdateBtn');
            if (toast) {
                toast.style.display = 'flex';
                reloadBtn.onclick = () => {
                    worker.postMessage({ type: 'SKIP_WAITING' });
                    toast.style.display = 'none';
                };
                dismissBtn.onclick = () => {
                    toast.style.display = 'none';
                };
            }
        }

        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(reg => {
                console.log('Service worker registered successfully.');

                // Check if there's already a waiting worker
                if (reg.waiting) { showUpdateToast(reg.waiting); return; }

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateToast(newWorker);
                        }
                    });
                });
            }).catch(err => console.error('Service worker registration failed:', err));

            let refreshing;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                window.location.reload();
                refreshing = true;
            });
        });
    }

    // ===================================================================================
    // PWA INSTALLATION LOGIC
    // ===================================================================================
    let deferredPrompt;
    const installBtn = document.getElementById('installAppBtn');
    const installModal = document.getElementById('installModal');
    const confirmInstallBtn = document.getElementById('confirmInstallBtn');
    const cancelInstallBtn = document.getElementById('cancelInstallBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('PWA Install Prompt fired!');
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        
        // Show the modal automatically
        if (installModal) installModal.style.display = 'flex';
        
        // HIDE the header button initially (cleaner UI)
        // It will only appear if they cancel the modal
        if (installBtn) installBtn.style.display = 'none';
    });

    async function triggerInstall() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
        }
        if (installModal) installModal.style.display = 'none';
        if (installBtn) installBtn.style.display = 'none';
    }

    if (confirmInstallBtn) {
        confirmInstallBtn.addEventListener('click', triggerInstall);
    }

    if (cancelInstallBtn) {
        cancelInstallBtn.addEventListener('click', () => {
            if (installModal) installModal.style.display = 'none';
            // NEW: Show the persistent button if user clicks "Maybe Later"
            if (installBtn) installBtn.style.display = 'flex';
        });
    }
    
    // NEW: Close modal on click outside and show button
    if (installModal) {
        installModal.addEventListener('click', (e) => {
            if (e.target === installModal) {
                installModal.style.display = 'none';
                if (installBtn) installBtn.style.display = 'flex';
            }
        });
    }

    if (installBtn) {
        installBtn.addEventListener('click', () => {
            if (installModal) {
                installModal.style.display = 'flex';
            } else {
                triggerInstall();
            }
        });
    }

    window.addEventListener('appinstalled', () => {
        if (installBtn) installBtn.style.display = 'none';
        if (installModal) installModal.style.display = 'none';
        deferredPrompt = null;
        console.log('PWA was installed');
    });

    // ===================================================================================
    // iOS INSTALLATION INSTRUCTIONS
    // ===================================================================================
    // Detect iOS devices (iPhone, iPad, iPod)
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // Check if already in standalone mode (installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator.standalone === true);

    if (isIos && !isStandalone && installModal) {
        // Customize modal content specifically for iOS users
        const modalTitle = installModal.querySelector('h2');
        const modalText = installModal.querySelector('p');
        
        if (modalTitle) modalTitle.textContent = "Install on iPhone/iPad";
        if (modalText) {
            modalText.innerHTML = `
                To install this app on your home screen:<br><br>
                1. Tap the <strong>Share</strong> button <span style="font-size: 1.3em; vertical-align: middle;">📤</span><br>
                2. Scroll down and tap <strong>"Add to Home Screen"</strong> <span style="font-size: 1.3em; vertical-align: middle;">➕</span>
            `;
            modalText.style.textAlign = 'left';
            modalText.style.lineHeight = '1.6';
            modalText.style.padding = '0 10px';
        }
        
        // Hide the "Install Now" button since iOS doesn't support programmatic install
        if (confirmInstallBtn) confirmInstallBtn.style.display = 'none';
        
        // Show the modal automatically
        installModal.style.display = 'flex';
    }

    let selectedImages = [];
    // NEW: Pre-loaded default logos to prevent race conditions during PDF generation
    let defaultLeftLogoBase64 = '';
    let defaultRightLogoBase64 = '';
    let defaultCUMCLogoBase64 = '';

    // NEW: Preload default assets to ensure they are always ready for printing
    async function preloadDefaultAssets() {
        try {
            // We await these to ensure they are available before any print action
            const left = await imageToBase64('image/rmci-logo.png');
            if (left) defaultLeftLogoBase64 = left;

            const right = await imageToBase64('image/ent-logo.webp');
            if (right) defaultRightLogoBase64 = right;

            const cumc = await imageToBase64('image/cumc-logo.png');
            if (cumc) defaultCUMCLogoBase64 = cumc;
            
            console.log("Default logos pre-loaded successfully into Base64.");
        } catch (error) {
            console.error("Critical Error: Failed to preload default logos. Logos may not appear in prints.", error);
        }
    }
    preloadDefaultAssets(); // Start preloading in background, do not block UI initialization
    
    // ===================================================================================
    // 1. CACHE DOM ELEMENTS
    // ===================================================================================
    // FONT-SIZE ADJUST HELPER
    // ===================================================================================
    function adjustFontSizeToFit(element, container) {
        if (!element || !container) return;

        let style = window.getComputedStyle(element);
        let currentFontSize = parseFloat(style.fontSize);
        let currentLetterSpacing = parseFloat(style.letterSpacing);
        if (isNaN(currentLetterSpacing)) currentLetterSpacing = 0; // Handle 'normal'

        // 1. Try reducing letter-spacing first (down to -1px) to keep font size large
        while (element.scrollWidth > container.offsetWidth && currentLetterSpacing > -1) {
            currentLetterSpacing -= 0.1;
            element.style.letterSpacing = `${currentLetterSpacing}px`;
        }

        // 2. If still doesn't fit, reduce font size
        while (element.scrollWidth > container.offsetWidth && currentFontSize > 8) {
            currentFontSize -= 0.5; // Decrease font size by a small amount
            element.style.fontSize = `${currentFontSize}px`;
        }
    }

    // ===================================================================================
    // SECURITY HELPER: ESCAPE HTML
    // ===================================================================================
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ===================================================================================
    const reportForm = document.getElementById("report-form");

    const imageInput = document.getElementById("imageInput");
    const previewDiv = document.getElementById("preview");
    const printDiv = document.getElementById("printDiv");
    const loadingSpinner = document.getElementById("loadingSpinner");
    // Print Options Modal elements
    const printOptionsModal = document.getElementById('printOptionsModal');
    const paperSizeSelect = document.getElementById('paperSizeSelect');
    const generatePdfBtn = document.getElementById('generatePdfBtn');
    const cancelPrintBtn = document.getElementById('cancelPrintBtn');
    const pdfPreviewModal = document.getElementById('pdfPreviewModal');
    const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
    const savePdfFromPreviewBtn = document.getElementById('savePdfFromPreviewBtn');
    const closePdfPreviewBtn = document.getElementById('closePdfPreviewBtn');
    let generatedPdfForSave = null; // To hold the generated PDF object
    const nativePrintPreviewModal = document.getElementById('nativePrintPreviewModal');
    const nativePrintPreviewContent = document.getElementById('nativePrintPreviewContent');
    const confirmPrintBtn = document.getElementById('confirmPrintBtn');
    const closeNativePrintPreviewBtn = document.getElementById('closeNativePrintPreviewBtn');
    // Cropper Modal Elements
    let cropper;
    let fileQueue = [];
    let currentFileForCropping = null;
    const cropModal = document.getElementById('cropModal');
    const imageToCrop = document.getElementById('imageToCrop');
    const cropButton = document.getElementById('cropButton');
    const skipCropButton = document.getElementById('skipCropButton');
    const cancelCropButton = document.getElementById('cancelCropButton');

    // Determine report type for local storage and dynamic printing
    let currentReportType = '';
    if (document.title.includes('Nasal')) {
        currentReportType = 'nasal';
    } else if (document.title.includes('Laryngeal')) {
        currentReportType = 'laryngeal';
    } else if (document.title.includes('ENT Endoscopy System')) {
        currentReportType = 'index';
    } else if (document.title.includes('Settings')) {
        currentReportType = 'settings';
    }
    const localStorageKey = currentReportType ? `${currentReportType}EndoscopyData` : 'endoscopyData'; // Fallback
    // Optional: Only cache patientNameInput if needed globally
    const patientNameInput = document.getElementById("patientName");

    // Check if the form was successfully loaded. If not, stop execution.
    if (!reportForm) {
        // If it's not a report page, this is fine. We'll check for other logic.
        console.log("Not a report page. Looking for settings form...");
    }

    // ===================================================================================
    // CUSTOM MODAL LOGIC (Replaces Alert/Confirm)
    // ===================================================================================
    const messageModal = document.getElementById('messageModal');
    const msgModalTitle = document.getElementById('msgModalTitle');
    const msgModalText = document.getElementById('msgModalText');
    const msgModalOkBtn = document.getElementById('msgModalOkBtn');
    const msgModalCancelBtn = document.getElementById('msgModalCancelBtn');

    function showCustomAlert(message, title = 'Notification') {
        if (!messageModal) { alert(message); return; } // Fallback
        msgModalTitle.textContent = title;
        msgModalText.textContent = message;
        msgModalCancelBtn.style.display = 'none';
        msgModalOkBtn.textContent = 'OK';
        
        // Use onclick to overwrite previous handlers (fixes stale reference issue)
        msgModalOkBtn.onclick = () => {
            messageModal.style.display = 'none';
        };
        
        messageModal.style.display = 'flex';
    }

    function showCustomConfirm(message, callback, title = 'Confirmation') {
        if (!messageModal) { const result = confirm(message); callback(result); return; } // Fallback
        msgModalTitle.textContent = title;
        msgModalText.textContent = message;
        msgModalCancelBtn.style.display = 'inline-block';
        msgModalOkBtn.textContent = 'Yes';

        // Use onclick to overwrite previous handlers
        msgModalOkBtn.onclick = () => {
            messageModal.style.display = 'none';
            callback(true);
        };

        msgModalCancelBtn.onclick = () => {
            messageModal.style.display = 'none';
            callback(false);
        };
        
        messageModal.style.display = 'flex';
    }

    // NEW HELPER FOR ASYNC CONFIRMATIONS
    function showCustomConfirmAsync(message, title = 'Confirmation') {
        return new Promise(resolve => {
            showCustomConfirm(message, resolve, title);
        });
    }

    // ===================================================================================
    // ONLINE/OFFLINE DETECTION
    // ===================================================================================
    function updateConnectionStatus(isOnline) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            const lastSync = localStorage.getItem('lastSyncTime');
            const syncText = lastSync ? `\nLast synced: ${lastSync}` : '';

            if (isOnline) {
                statusEl.classList.remove('offline');
                statusEl.classList.add('online');
                statusEl.title = "Online: You are connected to the internet." + syncText;
            } else {
                statusEl.classList.remove('online');
                statusEl.classList.add('offline');
                statusEl.title = "Offline: You are currently working offline." + syncText;
            }
        }
    }

    // NEW: Auto Sync Function
    function performAutoSync() {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.classList.remove('online', 'offline');
            statusEl.classList.add('syncing');
            statusEl.title = "Syncing data...";
        }

        console.log("Connection restored. Initiating auto-sync...");

        // 1. Retry loading images that failed (e.g., logos) while offline
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (img.style.display === 'none') {
                const currentSrc = img.src;
                img.src = ''; // Clear to force reload
                img.src = currentSrc;
                img.style.display = ''; // Reset display to visible
            }
        });

        // 2. Simulate Data Sync (Placeholder for future backend)
        setTimeout(() => {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            localStorage.setItem('lastSyncTime', timeString);

            if (statusEl) {
                statusEl.classList.remove('syncing');
                statusEl.classList.add('online');
                statusEl.title = `Online: You are connected to the internet.\nLast synced: ${timeString}`;
            }
            console.log("Sync complete.");
        }, 2000); // 2 seconds fake sync time
    }

    // Initial check on load
    updateConnectionStatus(navigator.onLine);

    window.addEventListener('online', () => {
        showCustomAlert("Internet connection restored. You are back online.", "Online");
        updateConnectionStatus(true);
        performAutoSync(); // Trigger Auto Sync
    });

    window.addEventListener('offline', () => {
        showCustomAlert("You are currently offline. The app is running in offline mode.", "Offline");
        updateConnectionStatus(false);
    });

    // ===================================================================================
    // HELPER: GET PHYSICIANS LIST
    // ===================================================================================
    function getPhysicians() {
        const stored = localStorage.getItem('clinicPhysicians');
        if (stored) {
            let physicians = JSON.parse(stored);
            // Auto-correct old name if present
            const oldName = 'Jess Ressurecion M. Jardin, MD, FPSO-HNS';
            const newName = 'JESUS RESURRECCION M. JARDIN, M.D., FPSO-HNS';
            const index = physicians.indexOf(oldName);
            if (index !== -1) {
                physicians[index] = newName;
                localStorage.setItem('clinicPhysicians', JSON.stringify(physicians));
            }
            return physicians;
        }
        // Default physicians if none stored
        return [
            'JESUS RESURRECCION M. JARDIN, MD., FPSO, HNS',
            'MONIQUE LUCIA A. JARDIN-QUING, MD, FPSO-HNS'
        ];
    }

    // ===================================================================================
    // EVENT LISTENERS
    // ===================================================================================
    // Attach listeners only if the elements exist on the current page.
    // This makes the script more robust and prevents errors on other pages.
    
    // Listeners for report pages (Nasal/Laryngeal)
    if (currentReportType === 'nasal' || currentReportType === 'laryngeal') {
        // Hide Referring Physician field as requested. This assumes the input has id="referringPhysician"
        // and is inside a div with class="form-group".
        const referringPhysicianInput = document.getElementById('referringPhysician');
        if (referringPhysicianInput) {
            const formGroup = referringPhysicianInput.closest('.form-group');
            if (formGroup) {
                formGroup.style.display = 'none';
            }
        }

        const imageInput = document.getElementById('imageInput');

        // AUTO-UPGRADE: Apply new button design to Laryngeal (or any page with old structure)
        if (imageInput && !imageInput.classList.contains('hidden-file-input')) {
            imageInput.classList.add('hidden-file-input');
            const customLabel = document.createElement('label');
            customLabel.htmlFor = 'imageInput';
            customLabel.className = 'custom-file-label';
            customLabel.textContent = '📂 Attach Image';
            if (imageInput.parentNode) {
                imageInput.parentNode.insertBefore(customLabel, imageInput.nextSibling);
            }
        }

        // Ensure preview div has the correct class for styling (fixes X button positioning)
        const previewDiv = document.getElementById('preview');
        if (previewDiv && !previewDiv.classList.contains('image-preview')) {
            previewDiv.classList.add('image-preview');
        }

        // Sync Header Logos from Settings
        const savedSettings = JSON.parse(localStorage.getItem('clinicSettings') || '{}');
        const headerLeftLogo = document.getElementById('headerLeftLogo');
        const headerRightLogo = document.getElementById('headerRightLogo');

        if (headerLeftLogo) {
            if (savedSettings.leftLogo) {
                headerLeftLogo.src = savedSettings.leftLogo;
            } else if (savedSettings.hospitalHeader === 'capitol') {
                headerLeftLogo.src = 'image/cumc-logo.png';
            }
        }
        if (headerRightLogo && savedSettings.rightLogo) {
            headerRightLogo.src = savedSettings.rightLogo;
        }

        // NEW: Enhance dropdowns to be editable with suggestions (Findings & Procedure Type)
        function enhanceDropdowns() {
            // --- CONFIGURATION FOR SPECIFIC OPTIONS ---
            // To add more specific options, just add a new entry here.
            // The key should be the 'id' of the select element.
            const specificOptionsConfig = {
                // --- GENERAL PATIENT INFO ---
                'patientSex': ['Male', 'Female'],
                
                // --- PROCEDURE DETAILS ---
                'indication': [
                    'Nasal Obstruction', 'Epistaxis (Nosebleed)', 'Chronic Sinusitis', 'Anosmia / Hyposmia', 'Nasal Polyposis', 'Foreign Body Sensation',
                    'Hoarseness / Dysphonia', 'Dysphagia (Difficulty Swallowing)', 'Odynophagia (Painful Swallowing)', 'Stridor', 'Hemoptysis', 
                    'Neck Mass', 'Laryngopharyngeal Reflux (LPR)', 'Screening / Clearance', 'Post-op Checkup'
                ],
                'anesthesiaUsed': [
                    'Local', 'Topical Anesthesia (Spray)', '10% Lidocaine Spray', '2% Xylocaine Spray', 'Co-Phenylcaine Spray', '4% Cocaine Solution', 
                    'Oxymetazoline Spray', 'Local Infiltration', 'General Anesthesia', 'None'
                ],

                // --- NASAL FINDINGS ---
                'septum': ['Normal / Midline', 'Deviated to the Left (Obstructing)', 'Deviated to the Right (Obstructing)', 'Deviated to the Left (Non-obstructing)', 'Deviated to the Right (Non-obstructing)', 'Septal Spur (Contacting Turbinate)', 'Perforated Septum (Trauma/Surgery)'],
                'discharge': ['None', 'Clear / Watery (Allergic/Viral)', 'Mucoid (Chronic Inflammation)', 'Purulent (Bacterial Infection)', 'Mucopurulent (Mixed)', 'Bloody (Trauma/Epistaxis)', 'Crusting (Atrophic Rhinitis)'],
                'mucosa': ['Pink / Normal', 'Pale / Boggy (Allergic Rhinitis)', 'Congested / Inflamed (Rhinitis)', 'Erythematous (Acute Inflammation)', 'Atrophic (Dry/Thin)', 'Ulcerated (Trauma/Infection)'],
                'it': ['Normal', 'Hypertrophic (Chronic Obstruction)', 'Atrophic (Empty Nose)', 'Pale / Boggy (Allergy)', 'Congested (Inflammation)', 'Polypoid Change'], // Inferior Turbinate
                'mt': ['Normal', 'Hypertrophic', 'Polypoid Change', 'Concha Bullosa (Pneumatized)', 'Paradoxical Curvature (Anatomic Variant)'], // Middle Turbinate
                'mm': ['Clear / Patent', 'Discharge Present (Sinusitis)', 'Polyp (Inflammatory Mass)', 'Polyps (Bilateral)', 'Edematous (Swollen)', 'Mass Lesion (Neoplasm)'], // Middle Meatus
                'im': ['Clear', 'Discharge Present', 'Hasner\'s Valve Patent'], // Inferior Meatus
                'omc': ['Patent (Open)', 'Obstructed (Mucosal Edema)', 'Polypoid Obstruction', 'Discharge from Ostium (Sinusitis)'], // Ostiomeatal Complex
                'nasopharynx': ['Clear / Normal', 'Adenoid Hypertrophy (Obstructing)', 'Mass Lesion (Suspicious)', 'Ulceration', 'Post-nasal Drip (Rhinitis/Sinusitis)', 'Eustachian Tube Dysfunction'],

                // --- LARYNGEAL FINDINGS ---
                'epiglottis': ['Normal', 'Omega-shaped (Laryngomalacia)', 'Edematous (Acute Epiglottitis)', 'Erythematous (Inflammation)', 'Mass Lesion', 'Ulceration'],
                'vallecula': ['Clear', 'Vallecular Cyst (Retention Cyst)', 'Mass Lesion', 'Pooling of Saliva (Dysphagia)'],
                'pyriformSinuses': ['Clear', 'Pooling of Saliva (Obstruction/Dysphagia)', 'Mass Lesion', 'Foreign Body'],
                'arytenoids': ['Normal', 'Erythematous (LPR/Reflux)', 'Edematous (Inflammation)', 'Mass Lesion', 'Contact Ulcer (Granuloma)'],
                'falseVocalCords': ['Normal', 'Hypertrophic (Ventricular Dysphonia)', 'Erythematous'],
                'trueVocalCords': ['Normal (Pearly White)', 'Erythematous (Laryngitis)', 'Edematous (Reinke\'s Edema - Smoking)', 'Nodule (Vocal Abuse)', 'Polyp (Vocal Trauma)', 'Cyst (Mucous Retention)', 'Mass Lesion (Suspicious)', 'Palsy / Paralysis (Nerve Injury)', 'Leukoplakia (Pre-malignant)'],
                'vocalCordMobility': ['Mobile and Symmetrical', 'Unilateral Paralysis (Left)', 'Unilateral Paralysis (Right)', 'Bilateral Paralysis', 'Paresis (Weakness)', 'Fixed (Joint Ankylosis)'],
                'subglottis': ['Normal', 'Subglottic Stenosis (Narrowing)', 'Mass Lesion', 'Inflamed'],

                // --- IMPRESSION & RECOMMENDATION ---
                'impression': [
                    'Normal Endoscopic Findings', 'Deviated Nasal Septum', 'Septal Spur', 'Allergic Rhinitis', 'Acute Rhinosinusitis', 'Chronic Rhinosinusitis', 
                    'Nasal Polyposis', 'Adenoid Hypertrophy', 'Nasopharyngeal Mass', 'Laryngopharyngeal Reflux (LPR)', 'Acute Laryngitis', 'Chronic Laryngitis',
                    'Vocal Cord Nodule', 'Vocal Cord Polyp', 'Vocal Cord Cyst', 'Vocal Cord Paralysis (Unilateral)', 'Vocal Cord Paralysis (Bilateral)',
                    'Reinke\'s Edema', 'Laryngeal Mass', 'Subglottic Stenosis', 'Laryngeal Papillomatosis', 'Foreign Body', 'Epistaxis'
                ],
                'recommendation': [
                    'Medical Management', 'Nasal Saline Irrigation', 'Intranasal Corticosteroids', 'Antihistamines', 'Antibiotics', 'Decongestants',
                    'Proton Pump Inhibitors (PPI)', 'Dietary Modification', 'Lifestyle Changes', 'Voice Rest', 'Voice Therapy',
                    'CT Scan of Paranasal Sinuses', 'CT Scan of Neck', 'Biopsy', 'Direct Laryngoscopy', 'Septoplasty', 'FESS (Endoscopic Sinus Surgery)',
                    'Microlaryngeal Surgery', 'Follow up after 1 week', 'Follow up after 2 weeks', 'Refer to Neurologist', 'Refer to Oncologist', 'Refer to Gastroenterologist'
                ]
            };

            if (currentReportType === 'nasal') {
                specificOptionsConfig['endoscopyType'] = [
                    '0° Rigid Endoscope', '30° Rigid Endoscope', '45° Rigid Endoscope', 'Flexible Fiberoptic Scope'
                ];
            } else if (currentReportType === 'laryngeal') {
                specificOptionsConfig['endoscopyType'] = [
                    '70° Rigid Endoscope', '90° Rigid Endoscope', 'Flexible Fiberoptic Scope', 'Video Laryngoscope'
                ];
            }

            // Apply to all configured fields (Selects AND Inputs)
            Object.keys(specificOptionsConfig).forEach(id => {
                const element = document.getElementById(id);
                if (!element) return;

                const datalistId = `${id}-list`;
                
                // Avoid duplicates
                if (document.getElementById(datalistId)) return;

                // Create datalist
                const datalist = document.createElement('datalist');
                datalist.id = datalistId;
                specificOptionsConfig[id].forEach(val => {
                    const optionEl = document.createElement('option');
                    optionEl.value = val;
                    datalist.appendChild(optionEl);
                });
                
                // Insert datalist into DOM
                element.parentNode.appendChild(datalist);

                if (element.tagName === 'SELECT') {
                    // Convert SELECT to INPUT TEXT
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.id = id;
                    input.name = element.name;
                    input.setAttribute('list', datalistId);
                    input.className = element.className;
                    input.placeholder = "Select or type...";
                    // Preserve existing value or selection
                    input.value = element.value;
                    
                    element.replaceWith(input);
                } else if (element.tagName === 'INPUT' && element.type === 'text') {
                    // Attach to existing INPUT TEXT
                    element.setAttribute('list', datalistId);
                    element.placeholder = "Select or type...";
                }
            });
        }

        // NEW: Helper to resize/compress images (Prevents Storage Full errors & speeds up PDF)
        function resizeImage(base64Str, maxWidth = 1024, quality = 0.8) {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = base64Str;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Scale down if too big
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality)); // Convert to JPEG 80%
                };
                img.onerror = () => resolve(base64Str); // Fallback if error
            });
        }

        imageInput?.addEventListener('change', handleFileSelectForCropping);

        imageInput?.addEventListener('click', (e) => {
            if (selectedImages.length >= 6) {
                e.preventDefault();
                showCustomAlert("Maximum of 6 images reached. Please remove an image to add a new one.", "Limit Reached");
            }
        });
        
        // NEW: Auto-Capitalize Patient Name for professional look
        const pNameInput = document.getElementById('patientName');
        if (pNameInput) {
            pNameInput.addEventListener('blur', function() {
                if (this.value) {
                    this.value = this.value.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
                    this.dispatchEvent(new Event('input')); // Trigger auto-save
                }
            });
        }

        // Call the new function to transform dropdowns before other logic
        enhanceDropdowns();
        // NEW: Initialize Set All Normal Button for efficiency
        setupSetNormalButton();

        // Initialize Video to Image feature
        setupVideoToImage();
        // Initialize Auto Fields (Impression & Recommendation)
        setupAutoFields();
        // Initialize Clear Buttons
        addClearButtonsToInputs();

        // Button listeners
        document.getElementById('savePdfBtn')?.addEventListener('click', () => printReport({ showPreview: true }));
        document.getElementById('printBtn')?.addEventListener('click', handleNativePrint);
        document.getElementById('clearFormBtn')?.addEventListener('click', () => clearForm(true)); // Styled with .btn-secondary

        // INJECT: Undo Clear Button
        const clearBtn = document.getElementById('clearFormBtn');
        if (clearBtn) {
            const undoBtn = document.createElement('button');
            undoBtn.id = 'undoClearBtn';
            undoBtn.type = 'button';
            undoBtn.className = 'btn-secondary';
            undoBtn.style.display = 'none';
            undoBtn.innerHTML = '↩ Undo Clear';
            
            if (clearBtn.parentNode) clearBtn.parentNode.insertBefore(undoBtn, clearBtn.nextSibling);

            undoBtn.addEventListener('click', () => {
                if (lastClearedData) {
                    loadDataIntoForm(lastClearedData);
                    undoBtn.style.display = 'none';
                    showCustomAlert("Form data restored.", "Undo Successful");
                }
            });
        }

        // Help Modal Logic
        const helpBtn = document.getElementById('helpBtn');
        const helpModal = document.getElementById('helpModal');
        const closeHelpBtn = document.getElementById('closeHelpBtn');

        if (helpBtn && helpModal && closeHelpBtn) {
            helpBtn.addEventListener('click', () => {
                helpModal.style.display = 'flex';
            });
            closeHelpBtn.addEventListener('click', () => {
                helpModal.style.display = 'none';
            });
            // Close on click outside
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) helpModal.style.display = 'none';
            });
        }

        // ===================================================================================
        // TUTORIAL MODE LOGIC
        // ===================================================================================
        const tutorialBtn = document.getElementById('tutorialBtn');
        
        if (tutorialBtn) {
            const steps = [
                { id: 'printBtn', title: '🖨️ Print Report', text: 'Opens the print dialog immediately. Use this if you want to print directly to a printer.' },
                { id: 'savePdfBtn', title: '📄 Save as PDF', text: 'Generates a high-quality PDF file of the report which you can save, email, or print later.' },
                { id: 'clearFormBtn', title: '❌ Clear Form', text: 'Resets all fields and removes all images to start a fresh report.' },
                { id: 'helpBtn', title: '❓ Help', text: 'Shows a quick reference guide explaining these buttons anytime you need it.' }
            ];

            let currentStepIndex = 0;
            let overlay, tooltip;

            function createTutorialElements() {
                overlay = document.createElement('div');
                overlay.className = 'tutorial-overlay';
                document.body.appendChild(overlay);

                tooltip = document.createElement('div');
                tooltip.className = 'tutorial-tooltip';
                document.body.appendChild(tooltip);
            }

            function showStep(index) {
                if (index >= steps.length) {
                    endTutorial();
                    return;
                }

                const step = steps[index];
                const element = document.getElementById(step.id);

                if (!element) {
                    showStep(index + 1); // Skip if element not found
                    return;
                }

                // Highlight element
                document.querySelectorAll('.tutorial-active-element').forEach(el => {
                    el.classList.remove('tutorial-active-element');
                });
                element.classList.add('tutorial-active-element');

                // Position tooltip
                const rect = element.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                
                // Position below the element, centered
                let top = rect.bottom + scrollTop + 15;
                let left = rect.left + (rect.width / 2) - 140; // Center 280px tooltip

                // Boundary checks to keep tooltip on screen
                if (left < 10) left = 10;
                if (left + 280 > window.innerWidth) left = window.innerWidth - 290;

                tooltip.style.top = `${top}px`;
                tooltip.style.left = `${left}px`;
                
                // Content
                tooltip.innerHTML = `
                    <h4>${step.title}</h4>
                    <p>${step.text}</p>
                    <div class="tutorial-controls">
                        <button class="tutorial-btn tutorial-skip" id="tutSkipBtn">Skip</button>
                        <button class="tutorial-btn tutorial-next" id="tutNextBtn">${index === steps.length - 1 ? 'Finish' : 'Next'}</button>
                    </div>
                `;
                
                overlay.style.display = 'block';
                tooltip.style.display = 'block';

                // Listeners
                document.getElementById('tutNextBtn').onclick = () => {
                    currentStepIndex++;
                    showStep(currentStepIndex);
                };
                document.getElementById('tutSkipBtn').onclick = endTutorial;
                
                // Scroll to element
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            function endTutorial() {
                overlay.style.display = 'none';
                tooltip.style.display = 'none';
                document.querySelectorAll('.tutorial-active-element').forEach(el => {
                    el.classList.remove('tutorial-active-element');
                });
                currentStepIndex = 0;
            }

            tutorialBtn.addEventListener('click', () => {
                if (!overlay) createTutorialElements();
                currentStepIndex = 0;
                showStep(0);
            });
        }

    // ===================================================================================
    // SET ALL NORMAL BUTTON (NEW)
    // ===================================================================================
    function setupSetNormalButton() {
        // Only for report pages
        if (currentReportType !== 'nasal' && currentReportType !== 'laryngeal') return;

        // Find a good place to insert the button. 
        // Usually before the first finding input (e.g., 'septum' or 'epiglottis')
        const firstFindingId = currentReportType === 'nasal' ? 'septum' : 'epiglottis';
        const firstInput = document.getElementById(firstFindingId);
        
        if (!firstInput) return;

        // Create the button
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-set-normal'; // Use new custom class
        btn.innerHTML = '✅ Set All Normal';

        // Insert before the parent of the first input (assuming it's in a form-group or fieldset)
        let targetContainer = firstInput.closest('fieldset');
        
        // If inside a fieldset, insert as the first item in legend or top
        if (targetContainer) {
            const legend = targetContainer.querySelector('legend');
            if (legend) {
                legend.parentNode.insertBefore(btn, legend.nextSibling);
            } else {
                targetContainer.insertBefore(btn, targetContainer.firstChild);
            }
        } else {
            // Fallback: Insert before the input's container
            targetContainer = firstInput.closest('.form-group') || firstInput.parentNode;
            targetContainer.parentNode.insertBefore(btn, targetContainer);
        }

        btn.addEventListener('click', () => {
            showCustomConfirm("This will overwrite all current findings with 'Normal' values. Proceed?", (confirmed) => {
                if (confirmed) {
                    // Define Normal Values based on Report Type
                    const normalValues = currentReportType === 'nasal' ? {
                        'septum': 'Normal / Midline',
                        'discharge': 'None',
                        'mucosa': 'Pink / Normal',
                        'it': 'Normal',
                        'mt': 'Normal',
                        'mm': 'Clear / Patent',
                        'im': 'Clear',
                        'omc': 'Patent (Open)',
                        'nasopharynx': 'Clear / Normal'
                    } : {
                        'epiglottis': 'Normal',
                        'vallecula': 'Clear',
                        'pyriformSinuses': 'Clear',
                        'arytenoids': 'Normal',
                        'falseVocalCords': 'Normal',
                        'trueVocalCords': 'Normal (Pearly White)',
                        'vocalCordMobility': 'Mobile and Symmetrical',
                        'subglottis': 'Normal'
                    };

                    // Apply values
                    let changeCount = 0;
                    for (const [id, value] of Object.entries(normalValues)) {
                        const input = document.getElementById(id);
                        if (input) {
                            input.value = value;
                            input.dispatchEvent(new Event('input')); // Trigger auto-save
                            changeCount++;
                        }
                    }
                    
                    // Also update Impression/Recommendation if they are empty
                    const imp = document.getElementById('impression');
                    const rec = document.getElementById('recommendation');
                    
                    if (imp && !imp.value) {
                        imp.value = currentReportType === 'nasal' ? 'Normal Endoscopic Findings' : 'Normal Laryngoscopy';
                        imp.dispatchEvent(new Event('input'));
                    }
                    if (rec && !rec.value) {
                        rec.value = 'Follow up as needed';
                        rec.dispatchEvent(new Event('input'));
                    }

                    showCustomAlert(`Updated ${changeCount} fields to Normal.`, "Success");
                }
            }, "Set All Normal");
        });
    }

        // Populate Physician Select
        const physicianSelect = document.getElementById('physician');
        if (physicianSelect) {
            const physicians = getPhysicians();
            physicianSelect.innerHTML = ''; // Clear existing options
            physicians.forEach((name, index) => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                if (index === 0) option.selected = true; // Select first by default
                physicianSelect.appendChild(option);
            });
        }

        // Listeners for the new Print Options Modal
        generatePdfBtn?.addEventListener('click', () => {
            const selectedSize = paperSizeSelect.value;
            printOptionsModal.style.display = 'none';
            // Call generatePdf and tell it to show the preview
            printReport({ paperFormat: selectedSize, showPreview: true });
        });
        cancelPrintBtn?.addEventListener('click', () => printOptionsModal.style.display = 'none');

        // Listeners for the new PDF Preview Modal
        savePdfFromPreviewBtn?.addEventListener('click', () => {
            if (generatedPdfForSave) {
                generatedPdfForSave.pdf.save(generatedPdfForSave.pdfFilename);
            }
            pdfPreviewModal.style.display = 'none';
        });
        closePdfPreviewBtn?.addEventListener('click', () => {
            pdfPreviewModal.style.display = 'none';
            // Revoke the blob URL to free up memory
            if (pdfPreviewFrame.src.startsWith('blob:')) {
                URL.revokeObjectURL(pdfPreviewFrame.src);
            }
        });

        // Listeners for the new Native Print Preview Modal
        confirmPrintBtn?.addEventListener('click', () => window.print());
        closeNativePrintPreviewBtn?.addEventListener('click', () => nativePrintPreviewModal.style.display = 'none');

        function loadDataIntoForm(data) {
            clearFormWithoutConfirmation();
            for (const key in data) {
                if (key === 'images') {
                    // Validate that images is an array and contains strings to prevent PDF errors
                    if (Array.isArray(data.images)) {
                        selectedImages = data.images.filter(img => typeof img === 'string' && img.length > 0);
                    } else {
                        selectedImages = [];
                    }
                    refreshPreview();
                } else if (key === 'procedureDate') {
                    const element = document.getElementById(key);
                    if (element) {
                        element.value = data[key] ? data[key] : getTodayDate();
                    }
                } else {
                const element = document.getElementById(key);
                if (element) element.value = data[key] || '';
            }
        }
        }

        // ===================================================================================
        // CROPPER LOGIC (NEW)
        // ===================================================================================
        function handleFileSelectForCropping(event) {
            const maxImages = 6;
            if (selectedImages.length >= maxImages) {
                showCustomAlert(`You can only upload a maximum of ${maxImages} images.`, "Limit Reached");
                event.target.value = null;
                return;
            }

            const files = Array.from(event.target.files);
            if (files.length === 0) return; // Stop if no file was selected
            const spaceLeft = maxImages - selectedImages.length;
            
            if (files.length > spaceLeft) {
                showCustomAlert(`You can only add ${spaceLeft} more image(s). The first ${spaceLeft} will be processed.`);
            }

            fileQueue = files.slice(0, spaceLeft);
            event.target.value = null; // Clear input immediately

            if (fileQueue.length > 0) {
                processNextFileInQueue();
            }
        }

        function processNextFileInQueue() {
            if (fileQueue.length === 0) {
                cropModal.style.display = 'none';
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
                return;
            }

            currentFileForCropping = fileQueue.shift(); // Get the next file

            // Safety Check: Prevent uploading very large images
            if (currentFileForCropping.size > 2 * 1024 * 1024) { // 2MB limit
                showCustomAlert(`The image "${currentFileForCropping.name}" is too large (>2MB) and will be skipped.`, "File Too Large");
                processNextFileInQueue(); // Skip to next file
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                // FALLBACK: If Cropper library isn't loaded (e.g., offline), add image directly.
                if (typeof Cropper === 'undefined') {
                    console.warn('Cropper.js not loaded. Skipping crop feature.');
                    resizeImage(e.target.result).then(resized => {
                        addBase64ToPreview(resized);
                        processNextFileInQueue();
                    });
                    return;
                }

                imageToCrop.src = e.target.result;
                cropModal.style.display = 'flex';
                
                if (cropper) {
                    cropper.replace(e.target.result);
                } else {
                    cropper = new Cropper(imageToCrop, {
                        aspectRatio: 1,
                        viewMode: 1,
                        background: false,
                        autoCropArea: 0.8,
                    });
                }
            };
            reader.readAsDataURL(currentFileForCropping);
        }

        // Add listeners for cropper buttons
        cropButton?.addEventListener('click', () => {
            if (cropper) {
                const canvas = cropper.getCroppedCanvas({ width: 512, height: 512, imageSmoothingQuality: 'high' });
                addBase64ToPreview(canvas.toDataURL('image/jpeg'));
                processNextFileInQueue(); // Process the next file in the queue
            }
        });

        skipCropButton?.addEventListener('click', () => {
            if (currentFileForCropping) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    // Compress image before adding
                    const resized = await resizeImage(e.target.result);
                    addBase64ToPreview(resized);
                    processNextFileInQueue();
                };
                reader.readAsDataURL(currentFileForCropping);
            }
        });

        cancelCropButton?.addEventListener('click', () => {
            fileQueue = []; // Clear the queue
            processNextFileInQueue(); // This will just close the modal
        });

        // ===================================================================================
        // 7. AUTO-SAVE & AUTO-LOAD LOGIC (MOVED HERE)
        // ===================================================================================
        function saveToLocal() {
            const data = getFormData();
            try {
                localStorage.setItem(localStorageKey, JSON.stringify(data));
            } catch (e) {
                // Handle Storage Full Error (QuotaExceededError)
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    console.warn("LocalStorage full. Saving text data only to prevent data loss.");
                    // Try saving without images to ensure text inputs are safe
                    const dataNoImages = { ...data, images: [] };
                    try {
                        localStorage.setItem(localStorageKey, JSON.stringify(dataNoImages));
                    } catch (e2) {
                        console.error("Critical: Cannot save data even without images.", e2);
                    }
                }
            }
        }

        // Add auto-save listeners to all form elements
        Array.from(reportForm.elements).forEach(element => {
            if (element.type !== 'file' && element.tagName !== 'BUTTON') {
                element.addEventListener('input', saveToLocal);
            }
        });

        // NEW: Listen for image changes to trigger auto-save
        document.addEventListener('formStateChanged', saveToLocal);

        // Auto-load from localStorage
        const saved = localStorage.getItem(localStorageKey);
        if (saved) {
            const data = JSON.parse(saved);
            loadDataIntoForm(data);
        }

        // This is placed *after* loading data, so it only applies the default if the field is truly empty.
        const procedureDescInput = document.getElementById('procedureDescription');
        const endoTypeInput = document.getElementById('endoscopyType');

        // NEW: Auto-bullet points on Enter for Procedure Description
        if (procedureDescInput) {
            procedureDescInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    const start = this.selectionStart;
                    const value = this.value;
                    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                    const currentLine = value.substring(lineStart, start);
                    
                    // Check if line starts with bullet
                    if (currentLine.trim().startsWith('•')) {
                        e.preventDefault();
                        
                        // If line is just a bullet, remove it (end list)
                        if (currentLine.trim() === '•') {
                            const newValue = value.substring(0, lineStart) + value.substring(start);
                            this.value = newValue;
                            this.selectionStart = this.selectionEnd = lineStart;
                        } else {
                            // Continue list
                            const newValue = value.substring(0, start) + '\n• ' + value.substring(start);
                            this.value = newValue;
                            this.selectionStart = this.selectionEnd = start + 3; // length of \n• 
                        }
                        this.dispatchEvent(new Event('input')); // Trigger auto-save
                    }
                }
            });
        }

        if (currentReportType === 'nasal' && procedureDescInput) {
            // 1. Set Default Text if empty
            // DEFENSE: This follows the standard "Three-Pass Technique" for rigid nasal endoscopy.
            if (!procedureDescInput.value) {
                procedureDescInput.value = `The nasal cavity was prepared with topical decongestant and anesthetic. Using a [0° / 30° / 45°] rigid endoscope (or flexible fiberoptic scope), the three-pass technique was performed:\n\n• First Pass: Floor of the nose to the nasopharynx.\n• Second Pass: Medial to the middle turbinate into the sphenoethmoidal recess.\n• Third Pass: Into the middle meatus to visualize the ostiomeatal complex.\n\nPatient tolerated the procedure well.`;
            }

            // 2. Listen for changes in Scope Type to update the text dynamically
            if (endoTypeInput) {
                endoTypeInput.addEventListener('input', function() {
                    const selectedScope = this.value;
                    let scopeText = "[0° / 30° / 45°] rigid endoscope"; 
                    let isFlexible = false;

                    if (selectedScope.includes("Rigid")) {
                        scopeText = selectedScope.toLowerCase(); // e.g., "30° rigid endoscope"
                    } else if (selectedScope.includes("Flexible")) {
                        scopeText = "flexible fiberoptic scope";
                        isFlexible = true;
                    }

                    const rigidDesc = `the three-pass technique was performed:\n\n• First Pass: Floor of the nose to the nasopharynx.\n• Second Pass: Medial to the middle turbinate into the sphenoethmoidal recess.\n• Third Pass: Into the middle meatus to visualize the ostiomeatal complex.`;
                    const flexibleDesc = `a systematic examination of the nasal cavity was performed. The floor of the nose, inferior and middle meatus, sphenoethmoidal recess, and nasopharynx were visualized.`;

                    // 1. Handle Empty Field (Kapag blangko, ilagay ang buong template gamit ang napiling scope)
                    if (!procedureDescInput.value.trim()) {
                        procedureDescInput.value = `The nasal cavity was prepared with topical decongestant and anesthetic. Using a ${scopeText}, ${isFlexible ? flexibleDesc : rigidDesc}\n\nPatient tolerated the procedure well.`;
                        return;
                    }

                    // Update the text area
                    // We use a regex to replace the specific sentence part to preserve other edits if possible
                    let currentText = procedureDescInput.value;
                    
                    // 1. Update Scope Name
                    currentText = currentText.replace(
                        /Using a .*?(rigid endoscope|fiberoptic scope|\[.*?\]).*?,/i, 
                        `Using a ${scopeText},`
                    );
                    
                    // 2. Update Description Body (Only if it matches the default templates)
                    if (isFlexible && currentText.includes("three-pass technique")) {
                        currentText = currentText.replace(rigidDesc, flexibleDesc);
                    } else if (!isFlexible && currentText.includes("systematic examination")) {
                        currentText = currentText.replace(flexibleDesc, rigidDesc);
                    }

                    // Only update if the replacement was successful, to avoid overwriting a fully custom description
                    if (currentText !== procedureDescInput.value) {
                        procedureDescInput.value = currentText;
                        procedureDescInput.dispatchEvent(new Event('input')); // Trigger auto-save
                    }
                });
            }
        } else if (currentReportType === 'laryngeal' && procedureDescInput) {
            // 1. Set Default Text if empty
            if (!procedureDescInput.value) {
                procedureDescInput.value = `The oropharynx was prepared with topical anesthesia. Using a [70° / 90° rigid endoscope / flexible fiberoptic scope], the larynx was visualized.\n\nThe examination included:\n• Supraglottis: Epiglottis, vallecula, arytenoids, and pyriform sinuses were inspected.\n• Glottis: True and false vocal cords were evaluated.\n• Subglottis: The subglottic region was visualized.\n• Function: Vocal cord mobility and symmetry were assessed during phonation and respiration.\n\nPatient tolerated the procedure well.`;
            }

            // 2. Listen for changes in Scope Type to update the text dynamically
            if (endoTypeInput) {
                endoTypeInput.addEventListener('input', function() {
                    const selectedScope = this.value;
                    let scopeText = "[70° / 90° rigid endoscope / flexible fiberoptic scope]"; // Default placeholder

                    if (selectedScope.includes("Rigid")) {
                        scopeText = selectedScope.toLowerCase();
                    } else if (selectedScope.includes("Flexible")) {
                        scopeText = "flexible fiberoptic scope";
                    } else if (selectedScope.includes("Video")) {
                        scopeText = "video laryngoscope";
                    }

                    // 1. Handle Empty Field (Kapag blangko, ilagay ang buong template)
                    if (!procedureDescInput.value.trim()) {
                        procedureDescInput.value = `The oropharynx was prepared with topical anesthesia. Using a ${scopeText}, the larynx was visualized.\n\nThe examination included:\n• Supraglottis: Epiglottis, vallecula, arytenoids, and pyriform sinuses were inspected.\n• Glottis: True and false vocal cords were evaluated.\n• Subglottis: The subglottic region was visualized.\n• Function: Vocal cord mobility and symmetry were assessed during phonation and respiration.\n\nPatient tolerated the procedure well.`;
                        return;
                    }

                    // Update the text area using a regex specific to the laryngeal description
                    const currentText = procedureDescInput.value;
                    const newText = currentText.replace(
                        /Using a .*?(rigid endoscope|fiberoptic scope|laryngoscope|\[.*?\]).*?,/i, 
                        `Using a ${scopeText},`
                    );
                    
                    // Only update if the replacement was successful
                    if (newText !== currentText) {
                        procedureDescInput.value = newText;
                        procedureDescInput.dispatchEvent(new Event('input')); // Trigger auto-save
                    }
                });
            }
        }

        // NEW: Logic for the "Reset" button for Procedure Description
        const resetProcedureDescBtn = document.getElementById('resetProcedureDescBtn');
        if (resetProcedureDescBtn && procedureDescInput) {
            resetProcedureDescBtn.addEventListener('click', () => {
                let defaultText = '';
                if (currentReportType === 'nasal') {
                    // Determine scope type for reset
                    const scopeVal = endoTypeInput ? endoTypeInput.value : '';
                    let scopeText = "[0° / 30° / 45°] rigid endoscope";
                    let isFlexible = false;
                    
                    if (scopeVal.includes("Rigid")) scopeText = scopeVal.toLowerCase();
                    if (scopeVal.includes("Flexible")) { scopeText = "flexible fiberoptic scope"; isFlexible = true; }

                    const rigidDesc = `the three-pass technique was performed:\n\n• First Pass: Floor of the nose to the nasopharynx.\n• Second Pass: Medial to the middle turbinate into the sphenoethmoidal recess.\n• Third Pass: Into the middle meatus to visualize the ostiomeatal complex.`;
                    const flexibleDesc = `a systematic examination of the nasal cavity was performed. The floor of the nose, inferior and middle meatus, sphenoethmoidal recess, and nasopharynx were visualized.`;

                    defaultText = `The nasal cavity was prepared with topical decongestant and anesthetic. Using a ${scopeText}, ${isFlexible ? flexibleDesc : rigidDesc}\n\nPatient tolerated the procedure well.`;
                } else if (currentReportType === 'laryngeal') {
                    defaultText = `The oropharynx was prepared with topical anesthesia. Using a [70° / 90° rigid endoscope / flexible fiberoptic scope], the larynx was visualized.\n\nThe examination included:\n• Supraglottis: Epiglottis, vallecula, arytenoids, and pyriform sinuses were inspected.\n• Glottis: True and false vocal cords were evaluated.\n• Subglottis: The subglottic region was visualized.\n• Function: Vocal cord mobility and symmetry were assessed during phonation and respiration.\n\nPatient tolerated the procedure well.`;
                }
                
                if (defaultText) {
                    showCustomConfirm("Are you sure you want to reset the Procedure Description to its default template?", (confirmed) => {
                        if (confirmed) {
                            procedureDescInput.value = defaultText;
                            procedureDescInput.dispatchEvent(new Event('input')); // Trigger auto-save
                        }
                    }, "Reset Description");
                }
            });
        }
    }

    // ===================================================================================
    // THEME (DARK MODE) SWITCHER
    // ===================================================================================
    const themeToggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme');

    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeToggle) themeToggle.checked = true;
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', function() {
            if (this.checked) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // ===================================================================================
    // SCROLL TO TOP BUTTON
    // ===================================================================================
    // Find the main actions container by looking for key buttons (Print, Save, etc.)
    // This ensures the Top button is placed exactly in the "line up" with them.
    const keyButtons = ['printBtn', 'saveSettingsBtn', 'savePdfBtn', 'clearFormBtn'];
    let actionsDiv = null;

    for (const btnId of keyButtons) {
        const btn = document.getElementById(btnId);
        if (btn) {
            actionsDiv = btn.closest('.actions');
            if (actionsDiv) break;
        }
    }

    // Fallback: Select the last .actions div if specific buttons aren't found
    if (!actionsDiv) {
        const allActionDivs = document.querySelectorAll('.actions');
        if (allActionDivs.length > 0) actionsDiv = allActionDivs[allActionDivs.length - 1];
    }

    if (actionsDiv && currentReportType !== 'settings' && !actionsDiv.closest('.modal-content')) {
        const scrollTopBtn = document.createElement('button');
        scrollTopBtn.type = 'button';
        scrollTopBtn.className = 'btn-secondary no-print'; // Grey style
        scrollTopBtn.innerHTML = '↑ Top';
        scrollTopBtn.onclick = () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        actionsDiv.appendChild(scrollTopBtn);
    }


        // ===================================================================================
        // BACKUP & RESTORE LOGIC (NEW)
        // ===================================================================================
        const backupBtn = document.getElementById('backupDataBtn');
        const restoreBtn = document.getElementById('restoreDataBtn');
        const restoreInput = document.getElementById('restoreFileInput');

        if (backupBtn) {
            backupBtn.addEventListener('click', () => {
                const backupData = {
                    clinicSettings: JSON.parse(localStorage.getItem('clinicSettings') || '{}'),
                    clinicPhysicians: JSON.parse(localStorage.getItem('clinicPhysicians') || '[]'),
                    customHospitals: JSON.parse(localStorage.getItem('customHospitals') || '[]')
                };

                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", "ENT_System_Backup_" + getTodayDate() + ".json");
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            });
        }

        if (restoreBtn && restoreInput) {
            restoreBtn.addEventListener('click', () => restoreInput.click());

            restoreInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedData = JSON.parse(event.target.result);
                        
                        showCustomConfirm("This will overwrite your current settings and history. Are you sure?", (confirmed) => {
                            if (confirmed) {
                                if (importedData.clinicSettings) localStorage.setItem('clinicSettings', JSON.stringify(importedData.clinicSettings));
                                if (importedData.clinicPhysicians) localStorage.setItem('clinicPhysicians', JSON.stringify(importedData.clinicPhysicians));
                                if (importedData.customHospitals) localStorage.setItem('customHospitals', JSON.stringify(importedData.customHospitals));
                                
                                showCustomAlert("Data restored successfully! The page will now reload.", "Success");
                                setTimeout(() => location.reload(), 1500);
                            }
                        }, "Restore Data");
                    } catch (err) {
                        showCustomAlert("Invalid backup file.", "Error");
                        console.error(err);
                    }
                };
                reader.readAsText(file);
                e.target.value = ''; // Reset input
            });
        }

    // ===================================================================================
    // SETTINGS PAGE LOGIC
    // ===================================================================================
    if (currentReportType === 'settings') {
        const settingsForm = document.getElementById('settings-form');
        const saveBtn = document.getElementById('saveSettingsBtn');
        const settingsStorageKey = 'clinicSettings';

        // NEW: Dirty Flag for Unsaved Changes
        let isSettingsDirty = false;

        // NEW: Make Save Button Sticky (Floating Footer)
        if (saveBtn) {
            const actionsDiv = saveBtn.closest('.actions');
            if (actionsDiv) {
                Object.assign(actionsDiv.style, {
                    position: 'sticky',
                    bottom: '0',
                    backgroundColor: 'var(--panel-bg-color)',
                    zIndex: '100',
                    padding: '20px',
                    margin: '20px -20px -20px -20px', // Negative margins to stretch full width of card
                    borderTop: '1px solid var(--border-color)',
                    boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                    borderRadius: '0 0 16px 16px' // Match card border radius
                });
            }
        }

        // INJECT: Storage Usage Monitor
        if (settingsForm) {
            const storageContainer = document.createElement('div');
            storageContainer.className = 'form-group';
            storageContainer.style.marginTop = '20px';
            storageContainer.style.padding = '15px';
            storageContainer.style.backgroundColor = 'var(--bg-color)';
            storageContainer.style.border = '1px solid var(--border-color)';
            storageContainer.style.borderRadius = '8px';

            storageContainer.innerHTML = `
                <label class="form-label" style="display:flex; justify-content:space-between;">
                    <span>App Storage Usage (LocalStorage)</span>
                    <span id="storageText">0% used</span>
                </label>
                <div class="storage-meter-container">
                    <div id="storageFill" class="storage-meter-fill"></div>
                </div>
                <p style="font-size: 11px; color: var(--secondary-text-color); margin-top: 5px;">
                    If this reaches 100%, you won't be able to save new settings or reports. 
                    Try resetting settings or clearing browser data if full.
                </p>
            `;

            // Insert before the "Reset Application" section
            const resetSection = settingsForm.querySelector('#resetAllSettingsBtn')?.closest('.form-group');
            
            if (resetSection) {
                settingsForm.insertBefore(storageContainer, resetSection);
            } else {
                const actionsDiv = settingsForm.querySelector('.actions');
                settingsForm.insertBefore(storageContainer, actionsDiv);
            }

            // Calculate Storage Function
            const updateStorageDisplay = () => {
                let total = 0;
                for (let x in localStorage) {
                    if (localStorage.hasOwnProperty(x)) total += ((localStorage[x].length * 2));
                }
                // Approx 5MB limit (5 * 1024 * 1024 bytes)
                const limit = 5 * 1024 * 1024; 
                const percentage = Math.min(100, (total / limit) * 100).toFixed(1);
                const fill = document.getElementById('storageFill');
                const text = document.getElementById('storageText');
                
                if (fill && text) {
                    fill.style.width = `${percentage}%`;
                    text.textContent = `${(total / 1024).toFixed(0)}KB / 5120KB (${percentage}%)`;
                    
                    if (percentage > 90) {
                        fill.className = 'storage-meter-fill danger';
                    } else if (percentage > 70) {
                        fill.className = 'storage-meter-fill warning';
                    } else {
                        fill.className = 'storage-meter-fill';
                    }
                }
            };
            // Run immediately
            setTimeout(updateStorageDisplay, 100);
        }

        // INJECT: Image Fit Settings UI
        if (settingsForm) {
            const fitContainer = document.createElement('div');
            fitContainer.className = 'form-group';
            fitContainer.style.marginTop = '20px';
            fitContainer.style.paddingTop = '15px';
            fitContainer.style.borderTop = '1px dashed var(--border-color)';

            fitContainer.innerHTML = `
                <label class="form-label">Printed Image Scaling</label>
                <div style="display: flex; gap: 20px; justify-content: center; margin-top: 10px;">
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <input type="radio" name="imageObjectFit" value="cover">
                        <span>Fill Box (Crop to Fit)</span>
                    </label>
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <input type="radio" name="imageObjectFit" value="contain">
                        <span>Show Full Image (No Crop)</span>
                    </label>
                </div>
                <p style="font-size: 12px; color: var(--secondary-text-color); margin-top: 5px;">
                    "Fill Box" ensures all images are the same size but may crop edges.<br>
                    "Show Full Image" ensures the entire image is visible but may leave empty space.
                </p>
            `;

            const actionsDiv = settingsForm.querySelector('.actions');
            if (actionsDiv) {
                settingsForm.insertBefore(fitContainer, actionsDiv);
            }
        }

        // INJECT: Reset Buttons for Logos (Left/Right)
        if (settingsForm) {
            const createResetUI = (inputId, resetBtnId, undoBtnId) => {
                const input = document.getElementById(inputId);
                if (!input || document.getElementById(resetBtnId)) return;

                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.gap = '10px';
                wrapper.style.marginTop = '5px';

                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.id = resetBtnId;
                resetBtn.innerHTML = '↺ Reset to Default';
                resetBtn.className = 'btn-secondary';
                resetBtn.style.padding = '4px 10px';
                resetBtn.style.fontSize = '11px';
                resetBtn.style.minWidth = 'auto';
                resetBtn.title = "Remove custom logo and use the default one";

                const undoBtn = document.createElement('button');
                undoBtn.type = 'button';
                undoBtn.id = undoBtnId;
                undoBtn.innerHTML = '↩ Undo';
                undoBtn.className = 'btn-secondary';
                undoBtn.style.padding = '4px 10px';
                undoBtn.style.fontSize = '11px';
                undoBtn.style.minWidth = 'auto';
                undoBtn.style.display = 'none';

                wrapper.appendChild(resetBtn);
                wrapper.appendChild(undoBtn);

                if (input.parentNode) {
                    input.parentNode.insertBefore(wrapper, input.nextSibling);
                }
            };

            createResetUI('leftLogoInput', 'resetLeftLogoBtn', 'undoLeftLogoBtn');
            createResetUI('rightLogoInput', 'resetRightLogoBtn', 'undoRightLogoBtn');
        }

        // Helper to read file (Defined at top for scope visibility)
        function readFileAsBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        // ===================================================================================
        // DYNAMIC HOSPITAL LIST LOGIC
        // ===================================================================================
        const headerSelect = document.getElementById('hospitalHeaderSelect');
        const newHospitalInput = document.getElementById('newHospitalInput');
        const addNewHospitalBtn = document.getElementById('addNewHospitalBtn');
        const removeHospitalBtn = document.getElementById('removeHospitalBtn');
        const editHospitalBtn = document.getElementById('editHospitalBtn');

        function renderHospitalOptions(selectedValue) {
            if (!headerSelect) return;
            const defaultHospitals = [
                { value: 'rever', text: 'REVER MEDICAL CENTER INC.' },
                { value: 'capitol', text: 'CAPITOL UNIVERSITY MEDICAL CENTER' }
            ];
            const storedHospitals = JSON.parse(localStorage.getItem('customHospitals') || '[]');
            
            headerSelect.innerHTML = '';
            
            // Add Defaults
            defaultHospitals.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h.value;
                opt.textContent = h.text;
                headerSelect.appendChild(opt);
            });

            // Add Custom Stored
            storedHospitals.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h; // Value is the name itself
                opt.textContent = h;
                headerSelect.appendChild(opt);
            });

            if (selectedValue) headerSelect.value = selectedValue;
            
            // Update remove button visibility
            if (removeHospitalBtn) {
                const isDefault = defaultHospitals.some(h => h.value === (selectedValue || headerSelect.value));
                removeHospitalBtn.style.display = isDefault ? 'none' : 'block';
                if (editHospitalBtn) editHospitalBtn.style.display = isDefault ? 'none' : 'block';
            }
        }

        // Listener for Hospital Header Select to toggle custom input
        if (headerSelect) {
            headerSelect.addEventListener('change', function() {
                const isDefault = ['rever', 'capitol'].includes(this.value);
                if (removeHospitalBtn) removeHospitalBtn.style.display = isDefault ? 'none' : 'block';
                if (editHospitalBtn) editHospitalBtn.style.display = isDefault ? 'none' : 'block';
                
                // Auto-populate address for Capitol
                const clinicAddressInput = document.getElementById('clinicAddress');
                if (this.value === 'capitol' && clinicAddressInput) {
                    clinicAddressInput.value = 'Gusa Highway, Cagayan de Oro City, Misamis Oriental';
                    clinicAddressInput.dispatchEvent(new Event('input')); // Trigger preview update
                } else if (this.value === 'rever' && clinicAddressInput) {
                    clinicAddressInput.value = 'Zone 4, Capunuyan, Aplaya, Jasaan, Misamis Oriental';
                    clinicAddressInput.dispatchEvent(new Event('input'));
                }
            });
        }

        if (addNewHospitalBtn && newHospitalInput) {
            addNewHospitalBtn.addEventListener('click', () => {
                const newName = newHospitalInput.value.trim();
                if (newName) {
                    const storedHospitals = JSON.parse(localStorage.getItem('customHospitals') || '[]');
                    if (!storedHospitals.includes(newName)) {
                        storedHospitals.push(newName);
                        localStorage.setItem('customHospitals', JSON.stringify(storedHospitals));
                        renderHospitalOptions(newName); // Re-render and select new
                        newHospitalInput.value = '';
                        headerSelect.dispatchEvent(new Event('change')); // Trigger change logic
                    }
                }
            });
        }

        if (removeHospitalBtn) {
            removeHospitalBtn.addEventListener('click', () => {
                const selected = headerSelect.value;
                showCustomConfirm(`Are you sure you want to permanently delete "${selected}" from your hospital list?`, (confirmed) => {
                    if (confirmed) {
                        let storedHospitals = JSON.parse(localStorage.getItem('customHospitals') || '[]');
                        storedHospitals = storedHospitals.filter(h => h !== selected);
                        localStorage.setItem('customHospitals', JSON.stringify(storedHospitals));
                        renderHospitalOptions('rever'); // Reset to default
                        headerSelect.dispatchEvent(new Event('change'));
                        showCustomAlert(`"${selected}" has been removed successfully.`, "Deleted");
                    }
                }, "Remove Hospital");
            });
        }

        if (editHospitalBtn) {
            editHospitalBtn.addEventListener('click', () => {
                const currentName = headerSelect.value;
                const newName = prompt("Enter the new name for this hospital:", currentName);
                
                if (newName && newName.trim() !== "" && newName !== currentName) {
                    const trimmedName = newName.trim();
                    let storedHospitals = JSON.parse(localStorage.getItem('customHospitals') || '[]');
                    
                    // Check for duplicates
                    if (storedHospitals.includes(trimmedName)) {
                         showCustomAlert("A hospital with this name already exists.", "Duplicate Name");
                         return;
                    }

                    const index = storedHospitals.indexOf(currentName);
                    if (index !== -1) {
                        storedHospitals[index] = trimmedName;
                        localStorage.setItem('customHospitals', JSON.stringify(storedHospitals));
                        
                        // Update the saved setting if it matches the one being edited
                        const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
                        if (settings.hospitalHeader === currentName) {
                            settings.hospitalHeader = trimmedName;
                            localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
                        }

                        renderHospitalOptions(trimmedName);
                        headerSelect.dispatchEvent(new Event('change'));
                        showCustomAlert(`Hospital name updated successfully.`, "Success");
                    }
                }
            });
        }

        // Preview Header Logic
        const previewBtn = document.getElementById('previewHeaderBtn');
        const previewContainer = document.getElementById('headerPreviewContainer');
        
        if (previewBtn && previewContainer) {
            const updatePreview = async () => {
                // Get saved settings for fallback
                const savedSettings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
                
                // Handle Logos - Check inputs first (for live preview), then saved, then default
                const leftInput = document.getElementById('leftLogoInput');
                let leftLogoSrc = savedSettings.leftLogo || 'image/rmci-logo.png';
                if (leftInput && leftInput.files && leftInput.files[0]) {
                    try { leftLogoSrc = await readFileAsBase64(leftInput.files[0]); } catch(e) { console.error(e); }
                }

                const rightInput = document.getElementById('rightLogoInput');
                let rightLogoSrc = savedSettings.rightLogo || 'image/ent-logo.webp';
                if (rightInput && rightInput.files && rightInput.files[0]) {
                    try { rightLogoSrc = await readFileAsBase64(rightInput.files[0]); } catch(e) { console.error(e); }
                }

                // Get current form values
                const hospitalHeader = settingsForm.elements.hospitalHeader.value;
                const clinicName = settingsForm.elements.clinicName.value || 'ENT-HNS ENDOSCOPY UNIT';
                const address = settingsForm.elements.clinicAddress.value;
                const phone = settingsForm.elements.clinicPhoneNumber ? settingsForm.elements.clinicPhoneNumber.value : '';
                const rehabTextRaw = settingsForm.elements.rehabCenterText.value || 'MINDANAO EAR, NOSE, THROAT OUT-PATIENT REHABILITATION CENTER\n(MENTOR)';
                const rehabText = rehabTextRaw.replace(/\n/g, '<br>');

                // Get Styling Settings
                const headerFont = settingsForm.elements.headerFontFamily.value;
                const logoSize = settingsForm.elements.logoSize.value;
                const hospSize = settingsForm.elements.hospitalNameFontSize.value;
                const hospBold = settingsForm.elements.hospitalNameBold.checked ? 'bold' : 'normal';
                const subSize = settingsForm.elements.subtitleFontSize.value;
                const subBold = settingsForm.elements.subtitleBold.checked ? 'bold' : 'normal';
                const clinicSize = settingsForm.elements.clinicNameFontSize.value;
                const clinicBold = settingsForm.elements.clinicNameBold.checked ? 'bold' : 'normal';
                const addrSize = settingsForm.elements.addressFontSize.value;
                const addrBold = settingsForm.elements.addressBold.checked ? 'bold' : 'normal';
                const contactNoSize = settingsForm.elements.contactNoFontSize.value;
                const contactNoBold = settingsForm.elements.contactNoBold.checked ? 'bold' : 'normal';

                // Get template
                const template = document.getElementById('printHeaderTemplate');
                if (!template) return;

                // Clone and populate
                const clone = document.createElement('div');
                clone.innerHTML = template.innerHTML;

                // Update Logos in Preview
                const imgs = clone.querySelectorAll('img');
                imgs.forEach(img => {
                    if (img.alt === 'Left Logo') {
                        // Prioritize custom logo (uploaded or saved) over default hospital logo
                        const hasCustomLogo = (leftInput && leftInput.files && leftInput.files.length > 0) || savedSettings.leftLogo;
                        
                        if (!hasCustomLogo && hospitalHeader === 'capitol') {
                            img.src = 'image/cumc-logo.png';
                        }
                        if (hasCustomLogo) {
                            img.src = leftLogoSrc; // Use the custom one (uploaded or saved)
                        } else {
                            img.src = leftLogoSrc;
                            // Use Default Logos based on selection
                            if (hospitalHeader === 'capitol') {
                                img.src = 'image/cumc-logo.png';
                            } else {
                                // Default for Rever or others
                                img.src = 'image/rmci-logo.png';
                            }
                        }
                    }
                    if (img.alt === 'Right Logo') img.src = rightLogoSrc;
                    // Ensure they are visible
                    img.style.width = `${logoSize}px`;
                    img.style.height = `${logoSize}px`;
                    img.style.display = 'block';
                });

                // Update Hospital Header Text
                const textBlock = clone.querySelector('.header-text-block');
                if (textBlock) textBlock.style.fontFamily = headerFont;

                if (textBlock) {
                        let hospitalNameLine = hospitalHeader; // Default to value (for dynamic ones)
                        if (hospitalHeader === 'rever') {
                            hospitalNameLine = 'REVER MEDICAL CENTER INC.';
                        } else if (hospitalHeader === 'capitol') {
                            hospitalNameLine = 'CAPITOL UNIVERSITY MEDICAL CENTER';
                        }
                        textBlock.innerHTML = `
                            <div style="margin-bottom: 5px; line-height: 1.2; text-align: center;">
                                <span class="hospital-name-span" style="font-weight: ${hospBold}; font-size: ${hospSize}px; white-space: nowrap; display: inline-block;">${hospitalNameLine}</span><br>
                                <span class="subtitle-span" style="font-weight: ${subBold}; font-size: ${subSize}px; display: block; margin-bottom: 2px; white-space: nowrap;">
                                    ${rehabText}
                                </span><br>
                                <span style="font-weight: ${clinicBold}; font-size: ${clinicSize}px;">${clinicName}</span><br>
                                <span style="font-weight: ${addrBold}; font-size: ${addrSize}px;">${address}</span>
                                ${phone ? `<br><span style="font-weight: ${contactNoBold}; font-size: ${contactNoSize}px;">Contact No. || ${phone}</span>` : ''}
                            </div>`;
                }

                previewContainer.innerHTML = '';
                previewContainer.appendChild(clone);
                previewContainer.style.display = 'block'; // Make it visible so it has dimensions

                // Adjust font size after rendering
                const hospitalNameSpan = previewContainer.querySelector('.hospital-name-span');
                const subtitleSpan = previewContainer.querySelector('.subtitle-span');
                const textBlockContainer = previewContainer.querySelector('.header-text-block');
                adjustFontSizeToFit(hospitalNameSpan, textBlockContainer);
                adjustFontSizeToFit(subtitleSpan, textBlockContainer);
            };

            // Button click triggers toggle (Show/Hide)
            previewBtn.addEventListener('click', () => {
                if (previewContainer.style.display === 'none' || previewContainer.style.display === '') {
                    updatePreview();
                    previewBtn.textContent = "Hide Header Preview";
                    previewBtn.style.backgroundColor = "var(--secondary-hover-color)"; // Darker color to indicate active
                } else {
                    previewContainer.style.display = 'none';
                    previewBtn.textContent = "Show Header Preview";
                    previewBtn.style.backgroundColor = "var(--secondary-color)"; // Reset color
                }
            });

            // Auto-update on input change if preview is visible
            const inputs = settingsForm.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                const eventType = (input.type === 'file' || input.tagName === 'SELECT') ? 'change' : 'input';
                input.addEventListener(eventType, () => {
                    if (previewContainer.style.display !== 'none') {
                        updatePreview();
                    }
                });
            });
        }

            // Reset Styling Button Logic
            const resetStylingBtn = document.getElementById('resetStylingBtn');
            const undoStylingBtn = document.getElementById('undoStylingBtn');
            let previousStylingState = {};

            if (resetStylingBtn) {
                resetStylingBtn.addEventListener('click', () => {
                    showCustomConfirm("Are you sure you want to reset all header styling to default values?", (confirmed) => {
                        if (confirmed) {
                            // Save current state before resetting
                            previousStylingState = {
                                headerFontFamily: settingsForm.elements.headerFontFamily.value,
                                logoSize: settingsForm.elements.logoSize.value,
                                hospitalNameFontSize: settingsForm.elements.hospitalNameFontSize.value,
                                hospitalNameBold: settingsForm.elements.hospitalNameBold.checked,
                                subtitleFontSize: settingsForm.elements.subtitleFontSize.value,
                                subtitleBold: settingsForm.elements.subtitleBold.checked,
                                clinicNameFontSize: settingsForm.elements.clinicNameFontSize.value,
                                clinicNameBold: settingsForm.elements.clinicNameBold.checked,
                                addressFontSize: settingsForm.elements.addressFontSize.value,
                                addressBold: settingsForm.elements.addressBold.checked,
                                contactNoFontSize: settingsForm.elements.contactNoFontSize.value,
                                contactNoBold: settingsForm.elements.contactNoBold.checked
                            };

                            settingsForm.elements.headerFontFamily.value = 'Arial, sans-serif';
                            settingsForm.elements.logoSize.value = '100';
                            settingsForm.elements.hospitalNameFontSize.value = '25';
                            settingsForm.elements.hospitalNameBold.checked = true;
                            settingsForm.elements.subtitleFontSize.value = '12';
                            settingsForm.elements.subtitleBold.checked = false;
                            settingsForm.elements.clinicNameFontSize.value = '16';
                            settingsForm.elements.clinicNameBold.checked = true;
                            settingsForm.elements.addressFontSize.value = '12';
                            settingsForm.elements.addressBold.checked = false;
                            settingsForm.elements.contactNoFontSize.value = '12';
                            settingsForm.elements.contactNoBold.checked = false;

                            if (previewContainer && previewContainer.style.display !== 'none') {
                                updatePreview();
                            }
                            
                            // Show Undo button
                            if (undoStylingBtn) undoStylingBtn.style.display = 'inline-block';
                            showCustomAlert('Header styling has been reset to default values. Please save settings to apply changes permanently.', 'Styling Reset');
                        }
                    }, "Reset Confirmation");
                });
            }

            if (undoStylingBtn) {
                undoStylingBtn.addEventListener('click', () => {
                    // Restore previous state
                    settingsForm.elements.headerFontFamily.value = previousStylingState.headerFontFamily;
                    settingsForm.elements.logoSize.value = previousStylingState.logoSize;
                    settingsForm.elements.hospitalNameFontSize.value = previousStylingState.hospitalNameFontSize;
                    settingsForm.elements.hospitalNameBold.checked = previousStylingState.hospitalNameBold;
                    settingsForm.elements.subtitleFontSize.value = previousStylingState.subtitleFontSize;
                    settingsForm.elements.subtitleBold.checked = previousStylingState.subtitleBold;
                    settingsForm.elements.clinicNameFontSize.value = previousStylingState.clinicNameFontSize;
                    settingsForm.elements.clinicNameBold.checked = previousStylingState.clinicNameBold;
                    settingsForm.elements.addressFontSize.value = previousStylingState.addressFontSize;
                    settingsForm.elements.addressBold.checked = previousStylingState.addressBold;
                    settingsForm.elements.contactNoFontSize.value = previousStylingState.contactNoFontSize;
                    settingsForm.elements.contactNoBold.checked = previousStylingState.contactNoBold;

                    if (previewContainer && previewContainer.style.display !== 'none') updatePreview();
                    undoStylingBtn.style.display = 'none';
                    showCustomAlert('Styling settings restored.', 'Undo Successful');
                });
            }

            // ===================================================================================
            // GENERIC LIST MANAGER (For Physicians & Referring Physicians)
            // ===================================================================================
            function setupListManager(listId, inputId, addBtnId, storageKey, title, defaultValues = []) {
                const listEl = document.getElementById(listId);
                const inputEl = document.getElementById(inputId);
                const addBtn = document.getElementById(addBtnId);

                // Initialize with defaults if storage is empty (null) so they appear in the list
                if (localStorage.getItem(storageKey) === null && defaultValues.length > 0) {
                    localStorage.setItem(storageKey, JSON.stringify(defaultValues));
                }

                function getItems() {
                    return JSON.parse(localStorage.getItem(storageKey) || '[]');
                }

                function saveItems(items) {
                    localStorage.setItem(storageKey, JSON.stringify(items));
                }

                function render() {
                    if (!listEl) return;
                    const items = getItems();
                    listEl.innerHTML = '';
                    items.forEach((name, index) => {
                    const li = document.createElement('li');
                    Object.assign(li.style, {
                        padding: '10px', borderBottom: '1px solid var(--border-color)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    });
                    
                    const span = document.createElement('span');
                        span.textContent = name;
                    
                    const actionsDiv = document.createElement('div');
                    actionsDiv.style.display = 'flex';
                    actionsDiv.style.gap = '5px';

                    const editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.textContent = 'Edit';
                    Object.assign(editBtn.style, {
                        backgroundColor: '#3498db', padding: '5px 10px', fontSize: '12px',
                        margin: '0', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer'
                    });

                    editBtn.onclick = () => {
                            const newName = prompt(`Edit ${title}:`, name);
                        if (newName && newName.trim() !== "" && newName !== name) {
                                const currentItems = getItems();
                                currentItems[index] = newName.trim();
                                saveItems(currentItems);
                                render();
                        }
                    };

                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.textContent = 'Remove';
                    Object.assign(removeBtn.style, {
                        backgroundColor: '#e74c3c', padding: '5px 10px', fontSize: '12px',
                        margin: '0', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer'
                    });
                    
                    removeBtn.onclick = () => {
                        showCustomConfirm(`Are you sure you want to remove ${name}?`, (confirmed) => {
                            if (confirmed) {
                                const currentItems = getItems();
                                currentItems.splice(index, 1);
                                saveItems(currentItems);
                                render();
                            }
                        }, `Remove ${title}`);
                    };
                    
                    actionsDiv.appendChild(editBtn);
                    actionsDiv.appendChild(removeBtn);
                    li.appendChild(span);
                    li.appendChild(actionsDiv);
                        listEl.appendChild(li);
                    });
                }

                if (addBtn && inputEl) {
                    addBtn.addEventListener('click', () => {
                        const name = inputEl.value.trim();
                        if (name) {
                            const items = getItems();
                            items.push(name);
                            saveItems(items);
                            inputEl.value = '';
                            render();
                        }
                    });
                }

                render();
                    }

            // Initialize Lists
            setupListManager('physicianList', 'newPhysicianName', 'addPhysicianBtn', 'clinicPhysicians', 'Physician', [
                'JESUS RESURRECCION M. JARDIN, MD., FPSO, HNS',
                'MONIQUE LUCIA A. JARDIN-QUING, MD, FPSO-HNS'
            ]);

            // ===================================================================================
            // RESET ALL SETTINGS LOGIC
            // ===================================================================================
            const resetAllBtn = document.getElementById('resetAllSettingsBtn');

            if (resetAllBtn) {
                resetAllBtn.addEventListener('click', () => {
                    showCustomConfirm("Are you sure you want to reset ALL settings to default? This will delete your clinic details, physician list, and custom hospitals. This action cannot be undone.", (confirmed) => {
                        if (confirmed) {
                            localStorage.removeItem('clinicSettings');
                            localStorage.removeItem('clinicPhysicians');
                            localStorage.removeItem('customHospitals');
                            
                            isSettingsDirty = false; // Prevent unsaved changes warning on reload
                            showCustomAlert("All settings have been reset to default. The page will now reload.", "Reset Complete");
                            setTimeout(() => location.reload(), 1500);
                        }
                    }, "Confirm Reset");
                });
            }

        // Function to save settings
        async function saveSettings(e) {
            if (e) e.preventDefault(); // Prevent default form submission

            const saveBtn = document.getElementById('saveSettingsBtn');
            const originalText = saveBtn ? saveBtn.textContent : 'Save Settings';
            if (saveBtn) {
                saveBtn.textContent = 'Saving...';
                saveBtn.disabled = true;
            }
            
            // Add a short delay to ensure the "Saving..." state is visible and feels responsive
            await new Promise(resolve => setTimeout(resolve, 500));

            try {
                const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
                
                // Safely get values
                if (settingsForm.elements.clinicName) settings.clinicName = settingsForm.elements.clinicName.value;
                if (settingsForm.elements.clinicAddress) settings.clinicAddress = settingsForm.elements.clinicAddress.value;
                if (settingsForm.elements.clinicPhoneNumber) settings.clinicPhoneNumber = settingsForm.elements.clinicPhoneNumber.value;
                if (settingsForm.elements.rehabCenterText) settings.rehabCenterText = settingsForm.elements.rehabCenterText.value;
                if (settingsForm.elements.hospitalHeader) settings.hospitalHeader = settingsForm.elements.hospitalHeader.value;

                // Save Styling Settings
                settings.headerFontFamily = settingsForm.elements.headerFontFamily.value;
                settings.logoSize = settingsForm.elements.logoSize.value;
                settings.hospitalNameFontSize = settingsForm.elements.hospitalNameFontSize.value;
                settings.hospitalNameBold = settingsForm.elements.hospitalNameBold.checked;
                settings.subtitleFontSize = settingsForm.elements.subtitleFontSize.value;
                settings.subtitleBold = settingsForm.elements.subtitleBold.checked;
                settings.clinicNameFontSize = settingsForm.elements.clinicNameFontSize.value;
                settings.clinicNameBold = settingsForm.elements.clinicNameBold.checked;
                settings.addressFontSize = settingsForm.elements.addressFontSize.value;
                settings.addressBold = settingsForm.elements.addressBold.checked;
                settings.contactNoFontSize = settingsForm.elements.contactNoFontSize.value;
                settings.contactNoBold = settingsForm.elements.contactNoBold.checked;

                // Save Image Fit Setting
                const fitInput = settingsForm.querySelector('input[name="imageObjectFit"]:checked');
                if (fitInput) settings.imageObjectFit = fitInput.value;

                // Handle Logos
                const leftInput = document.getElementById('leftLogoInput');
                if (leftInput && leftInput.files.length > 0) {
                    // Check file size (warn if > 500KB)
                    if (leftInput.files[0].size > 500 * 1024) {
                        const confirmed = await showCustomConfirmAsync("Warning: The Left Logo file is large (" + (leftInput.files[0].size/1024).toFixed(0) + "KB). This might fill up your storage limit. Do you want to proceed?", "Large File Warning");
                        if (!confirmed) return;
                    }
                    settings.leftLogo = await readFileAsBase64(leftInput.files[0]);
                }

                const rightInput = document.getElementById('rightLogoInput');
                if (rightInput && rightInput.files.length > 0) {
                    // Check file size (warn if > 500KB)
                    if (rightInput.files[0].size > 500 * 1024) {
                        const confirmed = await showCustomConfirmAsync("Warning: The Right Logo file is large (" + (rightInput.files[0].size/1024).toFixed(0) + "KB). This might fill up your storage limit. Do you want to proceed?", "Large File Warning");
                        if (!confirmed) return;
                    }
                    settings.rightLogo = await readFileAsBase64(rightInput.files[0]);
                }

                // Try to save to localStorage with error handling
                try {
                    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
                    showCustomAlert('Your clinic settings have been successfully saved.', 'Settings Saved');
                    isSettingsDirty = false; // Reset dirty flag
                } catch (storageError) {
                    if (storageError.name === 'QuotaExceededError' || storageError.code === 22) {
                        showCustomAlert('Storage limit exceeded! The logo images might be too large. Please try smaller images.', 'Storage Error');
                    } else {
                        throw storageError;
                    }
                }
            } catch (error) {
                console.error("Error saving settings:", error);
                showCustomAlert('Failed to save settings: ' + error.message, 'Error');
            } finally {
                if (saveBtn) {
                    saveBtn.textContent = originalText;
                    saveBtn.disabled = false;
                }
            }
        }

        // Load existing settings into the form
        const savedSettings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
        
        // Auto-migrate old default values to new requirements
        if (savedSettings.logoSize === '120') savedSettings.logoSize = '100';
        if (savedSettings.hospitalNameFontSize === '26') savedSettings.hospitalNameFontSize = '25';
        if (savedSettings.subtitleFontSize === '14') savedSettings.subtitleFontSize = '12';
        if (savedSettings.clinicNameFontSize === '20') savedSettings.clinicNameFontSize = '16';

        // Render options FIRST, then set value
        renderHospitalOptions(savedSettings.hospitalHeader || 'rever');

        settingsForm.elements.clinicName.value = savedSettings.clinicName || 'ENT-HNS ENDOSCOPY UNIT';
        settingsForm.elements.clinicAddress.value = savedSettings.clinicAddress !== undefined ? savedSettings.clinicAddress : '';
        if (settingsForm.elements.clinicPhoneNumber) settingsForm.elements.clinicPhoneNumber.value = savedSettings.clinicPhoneNumber || '';
        settingsForm.elements.rehabCenterText.value = savedSettings.rehabCenterText !== undefined ? savedSettings.rehabCenterText : 'MINDANAO EAR, NOSE, THROAT OUT-PATIENT REHABILITATION CENTER\n(MENTOR)';
        
        if (settingsForm.elements.hospitalHeader) {
            // Value already set by renderHospitalOptions, but ensure change event fires
            // Trigger change event to update UI (show/hide custom input)
            settingsForm.elements.hospitalHeader.dispatchEvent(new Event('change'));
        }

        // Load Styling Settings (with defaults)
        settingsForm.elements.headerFontFamily.value = savedSettings.headerFontFamily || 'Arial, sans-serif';
        settingsForm.elements.logoSize.value = savedSettings.logoSize || '100';
        settingsForm.elements.hospitalNameFontSize.value = savedSettings.hospitalNameFontSize || '25';
        settingsForm.elements.hospitalNameBold.checked = savedSettings.hospitalNameBold !== false; // Default true
        settingsForm.elements.subtitleFontSize.value = savedSettings.subtitleFontSize || '12';
        settingsForm.elements.subtitleBold.checked = savedSettings.subtitleBold === true; // Default false
        settingsForm.elements.clinicNameFontSize.value = savedSettings.clinicNameFontSize || '16';
        settingsForm.elements.clinicNameBold.checked = savedSettings.clinicNameBold !== false; // Default true
        settingsForm.elements.addressFontSize.value = savedSettings.addressFontSize || '12';
        settingsForm.elements.addressBold.checked = savedSettings.addressBold === true; // Default false
        settingsForm.elements.contactNoFontSize.value = savedSettings.contactNoFontSize || '12';
        settingsForm.elements.contactNoBold.checked = savedSettings.contactNoBold === true; // Default false

        // Load Image Fit Setting
        const savedFit = savedSettings.imageObjectFit || 'cover';
        const fitRadio = settingsForm.querySelector(`input[name="imageObjectFit"][value="${savedFit}"]`);
        if (fitRadio) fitRadio.checked = true;

        // Reset Logo Listeners
        let previousLeftLogo = null;
        let previousRightLogo = null;
        const undoLeftLogoBtn = document.getElementById('undoLeftLogoBtn');
        const undoRightLogoBtn = document.getElementById('undoRightLogoBtn');

        document.getElementById('resetLeftLogoBtn')?.addEventListener('click', () => {
            showCustomConfirm("Are you sure you want to reset the Left Logo to default?", (confirmed) => {
                if (confirmed) {
                    const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
                    previousLeftLogo = settings.leftLogo; // Save before delete
                    delete settings.leftLogo;
                    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
                    if (undoLeftLogoBtn) undoLeftLogoBtn.style.display = 'inline-block';
                    showCustomAlert('Left logo reset to default. Please save settings if you made other changes.');
                }
            }, "Reset Logo");
        });

        undoLeftLogoBtn?.addEventListener('click', () => {
            if (previousLeftLogo) {
                const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
                settings.leftLogo = previousLeftLogo;
                localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
                undoLeftLogoBtn.style.display = 'none';
                showCustomAlert('Left logo restored.', 'Undo Successful');
            }
        });

        document.getElementById('resetRightLogoBtn')?.addEventListener('click', () => {
            showCustomConfirm("Are you sure you want to reset the Right Logo to default?", (confirmed) => {
                if (confirmed) {
                    const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
                    previousRightLogo = settings.rightLogo; // Save before delete
                    delete settings.rightLogo;
                    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
                    if (undoRightLogoBtn) undoRightLogoBtn.style.display = 'inline-block';
                    showCustomAlert('Right logo reset to default. Please save settings if you made other changes.');
                }
            }, "Reset Logo");
        });

        undoRightLogoBtn?.addEventListener('click', () => {
            if (previousRightLogo) {
                const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
                settings.rightLogo = previousRightLogo;
                localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
                undoRightLogoBtn.style.display = 'none';
                showCustomAlert('Right logo restored.', 'Undo Successful');
            }
        });

        saveBtn.addEventListener('click', saveSettings);

        // NEW: Track changes for "Unsaved Changes" protection
        const trackSettingsChange = () => { isSettingsDirty = true; };
        const settingsInputs = settingsForm.querySelectorAll('input, select, textarea');
        settingsInputs.forEach(input => {
            input.addEventListener('input', trackSettingsChange);
            input.addEventListener('change', trackSettingsChange);
        });

        // 1. Native Browser Check (Closing Tab/Window)
        window.addEventListener('beforeunload', (e) => {
            if (isSettingsDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // 2. Custom Modal for Back Button
        const backLinks = document.querySelectorAll('.back-button, a[href*="index.html"]');
        backLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                if (isSettingsDirty) {
                    e.preventDefault();
                    showCustomConfirm("You have unsaved changes in Settings. Are you sure you want to leave?", (confirmed) => {
                        if (confirmed) {
                            window.location.href = link.getAttribute('href') || './index.html';
                        }
                    }, "Unsaved Changes");
                }
            });
        });
    }

    // ===================================================================================
    // 2. HELPER FUNCTION: GET ALL FORM DATA
    // ===================================================================================
    function getFormData() {
        const data = {};
        // *** FIX: Check if reportForm exists before trying to access its elements ***
        if (!reportForm) {
            return data; // Return empty object if not on a report page
        }
        const formElements = reportForm.elements;

        for (let i = 0; i < formElements.length; i++) {
            const element = formElements[i];
            if (element.id && element.type !== 'file' && element.tagName !== 'BUTTON' && element.name) {
                if (element.type === 'checkbox') {
                    data[element.id] = element.checked;
                } else {
                    data[element.id] = element.value;
                }
            }
        }
        data.images = selectedImages;
        return data;
    }

    // ===================================================================================
    // 3. IMAGE HANDLING (Function body remains the same)
    // ===================================================================================
    function addBase64ToPreview(base64) {
        if (selectedImages.length < 6) {
            selectedImages.push(base64);
            refreshPreview();
        }
    }

    function addImageToPreviewDOM(base64, index) {
        const container = document.createElement("div");
        container.draggable = true;
        container.dataset.index = index;
        container.title = "Drag to reorder";

        const img = document.createElement("img");
        img.src = base64;

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×"; // Use × instead of X for better look
        removeBtn.className = "btn-remove-image";

        removeBtn.onclick = function() {
            const idx = parseInt(container.dataset.index);
            selectedImages.splice(idx, 1);
            refreshPreview();
        };

        // Drag events
        container.addEventListener('dragstart', (e) => {
            // When dragging starts, store the index of the item being dragged.
            e.dataTransfer.setData('text/plain', container.dataset.index);
            e.dataTransfer.effectAllowed = 'move'; // Visual feedback
            // Make the dragged item semi-transparent for a visual cue.
            container.style.opacity = '0.5';
        });

        container.addEventListener('dragend', (e) => {
            // When dragging ends, restore the item's opacity.
            container.style.opacity = '1';
            // Clean up any lingering drag-over styles from all items.
            document.querySelectorAll('#preview > div').forEach(el => el.classList.remove('drag-over'));
        });

        container.addEventListener('dragover', (e) => {
            // This is necessary to allow a drop to occur.
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move'; // Visual feedback
        });

        container.addEventListener('dragenter', (e) => {
            // Add the visual indicator when dragging over an element.
            container.classList.add('drag-over');
        });

        container.addEventListener('dragleave', (e) => {
            // Remove the visual indicator when dragging leaves an element.
            // Fix flickering: Only remove if leaving the container element itself
            if (e.relatedTarget && !container.contains(e.relatedTarget) && e.relatedTarget !== container) {
                container.classList.remove('drag-over');
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            // Remove the visual indicator on drop.
            container.classList.remove('drag-over');
            const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const targetIndex = parseInt(container.dataset.index);
            
            if (!isNaN(draggedIndex) && !isNaN(targetIndex) && draggedIndex !== targetIndex) {
                // Move the item instead of swapping for better UX
                const itemToMove = selectedImages[draggedIndex];
                selectedImages.splice(draggedIndex, 1); // Remove from old position
                selectedImages.splice(targetIndex, 0, itemToMove); // Insert at new position
                refreshPreview();
            }
        });

        container.appendChild(img);
        container.appendChild(removeBtn);
        previewDiv.appendChild(container);
    }

    function refreshPreview() {
        previewDiv.innerHTML = "";
        selectedImages.forEach((base64, idx) => addImageToPreviewDOM(base64, idx));

        // Disable the file input if the maximum number of images is reached.
        // Ensure input is enabled so we can intercept click and show alert
        if (imageInput) imageInput.disabled = false;

        // NEW: Trigger global event to notify auto-save logic
        document.dispatchEvent(new Event('formStateChanged'));
    }

    // ===================================================================================
    // VIDEO TO IMAGE FEATURE (NEW)
    // ===================================================================================
    function setupVideoToImage() {
        if (!imageInput) return;
        let currentVideoFile = null; // Store original file for manual conversion

        // ===================================================================================
        // NEW: In-Browser Video Conversion Engine (FFmpeg.wasm)
        // This will handle almost any video format by converting it to a browser-friendly
        // MP4 (H.264) on the fly.
        // ===================================================================================
        let ffmpeg;
        let isFFmpegLoading = false;

        const loadFFmpeg = async () => {
            if (ffmpeg && ffmpeg.isLoaded()) return ffmpeg;

            // If another process is already loading it, just wait for it to finish
            if (isFFmpegLoading) {
                await new Promise(resolve => {
                    const interval = setInterval(() => {
                        if (ffmpeg && ffmpeg.isLoaded()) {
                            clearInterval(interval);
                            resolve();
                        }
                    }, 100);
                });
                return ffmpeg;
            }

            isFFmpegLoading = true;
            const p = loadingSpinner ? loadingSpinner.querySelector('p') : null;
            if (loadingSpinner) {
                if (p) p.textContent = "Loading conversion engine (first time only, ~25MB)...";
                loadingSpinner.style.display = 'flex';
            }

            try {
                // Dynamically import the script from CDN if not present
                if (typeof FFmpeg === 'undefined') {
                    const script = document.createElement('script');
                    script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }

                ffmpeg = FFmpeg.createFFmpeg({
                    log: false, // Set to true for debugging conversion issues
                    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
                });
                await ffmpeg.load();
                if (loadingSpinner) loadingSpinner.style.display = 'none';
                return ffmpeg;
            } catch (err) {
                console.error("Failed to load FFmpeg:", err);
                showCustomAlert("Failed to load the video conversion engine. Please check your internet connection.", "Error");
                throw err;
            } finally {
                isFFmpegLoading = false;
                if (p) p.textContent = "Generating PDF..."; // Reset default text
            }
        };

        const transcodeVideo = async (file) => {
            const p = loadingSpinner ? loadingSpinner.querySelector('p') : null;
            if (loadingSpinner) {
                if (p) p.textContent = "Unsupported format. Converting video... Please wait.";
                loadingSpinner.style.display = 'flex';
            }

            // NEW: Check for large files (Browser memory limit risk)
            if (file.size > 300 * 1024 * 1024) { // 300MB warning threshold
                const confirmed = await showCustomConfirmAsync(
                    `⚠️ Large File Detected (${(file.size / (1024*1024)).toFixed(0)}MB)\n\nConverting large videos in the browser may fail or crash due to memory limits. Do you want to try anyway?`,
                    "Large File Warning"
                );
                if (!confirmed) {
                    if (loadingSpinner) loadingSpinner.style.display = 'none';
                    return null;
                }
            }

            try {
                const ffmpegInstance = await loadFFmpeg();
                const { name } = file;
                const fileData = await FFmpeg.fetchFile(file);
                ffmpegInstance.FS('writeFile', name, fileData);

                // Run conversion: -preset ultrafast for speed, -crf 28 for smaller file size
                await ffmpegInstance.run('-i', name, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', 'output.mp4');
                
                const data = ffmpegInstance.FS('readFile', 'output.mp4');
                const convertedBlob = new Blob([data.buffer], { type: 'video/mp4' });

                ffmpegInstance.FS('unlink', name);
                ffmpegInstance.FS('unlink', 'output.mp4');
                
                if (loadingSpinner) loadingSpinner.style.display = 'none';
                return convertedBlob;
            } catch (err) {
                console.error("Conversion failed:", err);
                if (loadingSpinner) loadingSpinner.style.display = 'none';
                
                let msg = "Video conversion failed.";
                if (file.size > 200 * 1024 * 1024) {
                    msg += " The file is likely too large for the browser to handle (Memory Limit). Try recording shorter clips.";
                } else {
                    msg += " The file might be corrupted or uses a format that cannot be processed.";
                }
                showCustomAlert(msg, "Conversion Error");
                return null;
            }
        };

        // 1. Create the "Video to Image" button dynamically
        const videoBtn = document.createElement('button');
        videoBtn.type = 'button';
        videoBtn.innerHTML = '📹 Video to Image';
        videoBtn.className = 'btn-video-to-image';

        // Insert after imageInput
        // Check for custom label first (new design)
        const customLabel = document.querySelector('label[for="imageInput"].custom-file-label');
        if (customLabel && customLabel.parentNode === imageInput.parentNode) {
            // Insert after the custom label
            imageInput.parentNode.insertBefore(videoBtn, customLabel.nextSibling);
        } else if (imageInput.parentNode) {
            imageInput.parentNode.insertBefore(videoBtn, imageInput.nextSibling);
        }

        // 2. Create hidden file input for video
        const videoInput = document.createElement('input');
        videoInput.type = 'file';
        videoInput.accept = 'video/*';
        videoInput.style.display = 'none';
        document.body.appendChild(videoInput);

        // 3. Create Modal for Video Playback
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            display: 'none', position: 'fixed', zIndex: '10000', left: '0', top: '0',
            width: '100%', height: '100%', overflow: 'auto', backgroundColor: 'rgba(0,0,0,0.85)',
            justifyContent: 'center', alignItems: 'center', flexDirection: 'column'
        });

        const modalContent = document.createElement('div');
        Object.assign(modalContent.style, {
            backgroundColor: document.body.classList.contains('dark-mode') ? '#2c2c2c' : '#fff',
            color: document.body.classList.contains('dark-mode') ? '#fff' : '#000',
            padding: '20px', borderRadius: '8px', maxWidth: '90%', maxHeight: '90%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
        });

        const videoPlayer = document.createElement('video');
        videoPlayer.controls = true;
        videoPlayer.muted = true; // Ensure autoplay works smoothly across browsers
        // Enable playsinline for mobile
        videoPlayer.setAttribute('playsinline', '');
        Object.assign(videoPlayer.style, {
            width: '100%', // Force width to fill
            minHeight: '300px', // Force min height (Fixes White Screen)
            backgroundColor: '#000', // Black background
            objectFit: 'contain', // Ensure video fits inside
            maxHeight: '60vh', marginBottom: '15px', border: '1px solid #ddd',
            transition: 'transform 0.3s ease',
            display: 'block'
        });

        // NEW: Add a help section for video issues
        const helpText = document.createElement('p');
        helpText.innerHTML = 'Video not playing? <a href="#" id="videoHelpLink">Click for help</a> or use <strong>Ctrl+V</strong> to paste a screenshot.';
        Object.assign(helpText.style, {
            fontSize: '12px',
            color: 'var(--secondary-text-color)',
            marginTop: '10px',
            textAlign: 'center'
        });

        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '10px';
        btnContainer.style.position = 'relative'; // Para gumana ang z-index
        btnContainer.style.zIndex = '10'; // Siguradong nasa ibabaw ng video
        
        const rotateBtn = document.createElement('button');
        rotateBtn.textContent = '🔄 Rotate'; // This is a primary-styled button by default
        Object.assign(rotateBtn.style, {
            padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
            /* backgroundColor is inherited from default button styles */
        });

        // NEW: Fix Black Screen Button (Manual Trigger)
        const fixBtn = document.createElement('button');
        fixBtn.textContent = '🛠️ Fix Black Screen';
        Object.assign(fixBtn.style, {
            padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
            backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px'
        });
        fixBtn.title = "Click here if the video is playing but the screen is black.";

        const captureBtn = document.createElement('button');
        captureBtn.textContent = '📸 Capture Frame';
        captureBtn.className = 'btn-capture-frame';


        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close'; // This button is styled as secondary via its ID
        closeBtn.id = 'closeVideoBtn'; // For styling
        Object.assign(closeBtn.style, {
            padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
            /* backgroundColor is handled by #closeVideoBtn selector in CSS */
        });

        btnContainer.appendChild(rotateBtn);
        btnContainer.appendChild(fixBtn);
        btnContainer.appendChild(captureBtn);
        btnContainer.appendChild(closeBtn);
        modalContent.appendChild(videoPlayer);
        modalContent.appendChild(btnContainer);
        modalContent.appendChild(helpText); // Add the help text to the modal
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 4. Event Listeners
        let currentRotation = 0;

        // NEW: Add listener for the help link
        const videoHelpLink = document.getElementById('videoHelpLink');
        if (videoHelpLink) {
            videoHelpLink.addEventListener('click', (e) => {
                e.preventDefault();
                showCustomAlert(
                    "**Video Troubleshooting:**\n\n1. **Black Screen?** Click '🛠️ Fix Black Screen'.\n2. **Alternative:** Open the video in an external player (like VLC), take a screenshot, and press **Ctrl+V** anywhere in this app to paste it.\n3. **Prevention:** In Bandicam settings, change the Codec to **H.264 (MP4)**.",
                    "Video Troubleshooting"
                );
            });
        }

        // NEW: Manual Fix Listener
        fixBtn.addEventListener('click', () => {
            if (!currentVideoFile) return;
            
            // Pause current video
            videoPlayer.pause();
            
            showCustomConfirm(
                "This will convert the video to a browser-friendly format (MP4/H.264). This fixes black screen issues but may take a moment. Proceed?",
                async (confirmed) => {
                    if (confirmed) {
                        const converted = await transcodeVideo(currentVideoFile);
                        if (converted) {
                            const finalUrl = URL.createObjectURL(converted);
                            if (videoPlayer.src.startsWith('blob:')) URL.revokeObjectURL(videoPlayer.src);
                            
                            videoPlayer.src = finalUrl;
                            videoPlayer.load();
                            currentRotation = 0;
                            videoPlayer.style.transform = 'rotate(0deg)';
                            
                            videoPlayer.addEventListener('loadeddata', () => {
                                if (videoPlayer.currentTime < 0.1) videoPlayer.currentTime = 0.1;
                            }, { once: true });
                            videoPlayer.play().catch(e => console.warn(e));
                        }
                    }
                }
            );
        });

        rotateBtn.addEventListener('click', () => {
            currentRotation = (currentRotation + 90) % 360;
            videoPlayer.style.transform = `rotate(${currentRotation}deg)`;
            
            // Adjust margin para hindi matabunan ang buttons kapag nakatayo (portrait) ang video
            if (currentRotation % 180 !== 0) {
                const offset = Math.max(0, (videoPlayer.offsetWidth - videoPlayer.offsetHeight) / 2);
                videoPlayer.style.marginBottom = `${15 + offset}px`;
            } else {
                videoPlayer.style.marginBottom = '15px';
            }
        });

        videoBtn.addEventListener('click', () => {
            if (selectedImages.length >= 6) {
                showCustomAlert("Maximum of 6 images reached. Please remove an image to add a new one.", "Limit Reached");
                return;
            }
            videoInput.click();
        });

        // NEW: Robust video loading logic with automatic conversion
        videoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            videoInput.value = null; // Clear input immediately
            if (!file) return;
            
            currentVideoFile = file; // Store for manual fix

            let videoBlob = file;
            let needsConversion = false;

            // 1. Check for .AVI extension (Bandicam default) - Force convert
            if (file.name.toLowerCase().endsWith('.avi')) {
                needsConversion = true;
            } else {
                // 2. Test if browser can play it
                const testPlayer = document.createElement('video');
                let isPlayable = false;

                const playablePromise = new Promise((resolve) => {
                    testPlayer.oncanplay = () => { isPlayable = true; resolve(); };
                    testPlayer.onerror = () => { isPlayable = false; resolve(); };
                    testPlayer.src = URL.createObjectURL(file);
                });

                await playablePromise;
                URL.revokeObjectURL(testPlayer.src);
                
                if (!isPlayable) needsConversion = true;
            }

            if (needsConversion) {
                // If the browser can't play it, start the conversion process.
                const converted = await transcodeVideo(file);
                if (converted) {
                    videoBlob = converted;
                } else {
                    // Conversion failed, so we stop here.
                    return;
                }
            }

            // Now, load the final (original or converted) video into the visible player.
            const finalUrl = URL.createObjectURL(videoBlob);
            videoPlayer.src = finalUrl;
            modal.style.display = 'flex';

            // Reset rotation and position
            currentRotation = 0;
            videoPlayer.style.transform = 'rotate(0deg)';
            videoPlayer.style.marginBottom = '15px';
            
            // NEW: Reset black screen check flag for the new video
            videoPlayer.dataset.blackScreenChecked = 'false';

            // Add a 'kickstart' to render the first frame on videos that start black
            videoPlayer.addEventListener('loadeddata', () => {
                if (videoPlayer.currentTime < 0.1) videoPlayer.currentTime = 0.1;
            }, { once: true });

            // NEW: Automatic Black Screen Detection
            const blackScreenCheckHandler = () => {
                // Check after 2 seconds of playback and only once
                if (videoPlayer.currentTime > 2 && videoPlayer.dataset.blackScreenChecked === 'false') {
                    videoPlayer.dataset.blackScreenChecked = 'true'; // Prevent re-running
                    videoPlayer.removeEventListener('timeupdate', blackScreenCheckHandler); // Clean up listener

                    if (videoPlayer.paused || videoPlayer.videoWidth === 0) return;

                    const canvas = document.createElement('canvas');
                    const checkSize = 32; // Small size for performance
                    canvas.width = checkSize;
                    canvas.height = checkSize;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(videoPlayer, 0, 0, checkSize, checkSize);

                    try {
                        const imageData = ctx.getImageData(0, 0, checkSize, checkSize).data;
                        let isBlack = true;
                        // Check if all pixels in the sample are very dark (threshold 15)
                        for (let i = 0; i < imageData.length; i += 4) {
                            if (imageData[i] > 15 || imageData[i+1] > 15 || imageData[i+2] > 15) {
                                isBlack = false;
                                break;
                            }
                        }

                        if (isBlack) {
                            console.log("Automatic black screen detection triggered.");
                            videoPlayer.pause();
                            showCustomConfirm(
                                "The video appears to be a black screen. This is a common issue with some recording software.\n\nWould you like to run the automatic fixer now?",
                                (confirmed) => {
                                    if (confirmed) {
                                        fixBtn.click(); // Trigger the existing fix button
                                    } else {
                                        videoPlayer.play().catch(e => console.warn("Autoplay after cancel failed", e));
                                    }
                                },
                                "Automatic Fix Suggested"
                            );
                        }
                    } catch (e) {
                        console.error("Error checking for black screen:", e);
                    }
                }
            };
            videoPlayer.addEventListener('timeupdate', blackScreenCheckHandler);

            // Try to autoplay
            const playPromise = videoPlayer.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => console.warn("Auto-play was prevented. User can click play.", error));
            }
        });

        captureBtn.addEventListener('click', () => {
            // SAFETY CHECK: Ensure video has valid data before capturing
            if (videoPlayer.error) {
                showCustomAlert("Cannot capture: The video file is corrupted or unsupported.", "Capture Error");
                return;
            }
            if (videoPlayer.readyState < 2) {
                showCustomAlert("Video is not ready. Please play the video first.", "Capture Error");
                return;
            }
            if (videoPlayer.videoWidth === 0 || videoPlayer.videoHeight === 0) {
                showCustomAlert("Cannot capture: Video has no dimensions (0x0).", "Capture Error");
                return;
            }

            try {
                const canvas = document.createElement('canvas');
                
                if (currentRotation === 90 || currentRotation === 270) {
                    canvas.width = videoPlayer.videoHeight;
                    canvas.height = videoPlayer.videoWidth;
                } else {
                    canvas.width = videoPlayer.videoWidth;
                    canvas.height = videoPlayer.videoHeight;
                }

                const ctx = canvas.getContext('2d');
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(currentRotation * Math.PI / 180);
                ctx.drawImage(videoPlayer, -videoPlayer.videoWidth / 2, -videoPlayer.videoHeight / 2);
                
                const dataURL = canvas.toDataURL('image/png');
                
                if (dataURL === 'data:,') throw new Error("Empty image data");

                if (selectedImages.length >= 6) {
                    showCustomAlert("Maximum of 6 images reached.", "Limit Reached");
                } else {
                    // Compress the captured frame before saving
                    resizeImage(dataURL).then(resized => {
                        selectedImages.push(resized);
                        refreshPreview();
                    });
                    
                    // Strong Visual Feedback (Flash Effect)
                    const originalTransition = videoPlayer.style.transition;
                    videoPlayer.style.transition = 'filter 0.1s ease-out, transform 0.3s ease'; 
                    videoPlayer.style.filter = 'brightness(1.8) contrast(0.8)'; 
                    
                    setTimeout(() => {
                        videoPlayer.style.filter = 'none';
                        setTimeout(() => {
                            videoPlayer.style.transition = originalTransition;
                        }, 150);
                    }, 100);

                    // Button Animation
                    const originalText = captureBtn.textContent;
                    const originalBg = captureBtn.style.backgroundColor;
                    captureBtn.textContent = '✅ SAVED!';
                    captureBtn.style.backgroundColor = '#2ecc71';
                    captureBtn.style.transform = 'scale(1.1)';
                    captureBtn.style.boxShadow = '0 0 20px rgba(46, 204, 113, 0.8)';
                    captureBtn.style.transition = 'all 0.1s ease';
                    
                    setTimeout(() => {
                        captureBtn.textContent = originalText;
                        captureBtn.style.backgroundColor = originalBg;
                        captureBtn.style.transform = 'scale(1)';
                        captureBtn.style.boxShadow = 'none';
                    }, 800);
                }
            } catch (err) {
                console.error(err);
                showCustomAlert("Failed to capture image. Video might be unsupported.", "Error");
            }
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            videoPlayer.pause();
            if (videoPlayer.src) {
                URL.revokeObjectURL(videoPlayer.src);
            }
            videoPlayer.src = '';
            currentRotation = 0;
            videoPlayer.style.transform = 'rotate(0deg)';
            videoPlayer.style.marginBottom = '15px';
        });
    }

    // ===================================================================================
    // AUTO-FIELDS GENERATOR (Impression & Recommendation)
    // ===================================================================================
    function setupAutoFields() {
        const impressionInput = document.getElementById('impression');
        const recommendationInput = document.getElementById('recommendation');
        
        if (!impressionInput && !recommendationInput) return;

        // 1. Define Generator Logic
        const generateImpression = () => {
            const data = getFormData();
            let suggestions = [];

            if (currentReportType === 'nasal') {
                if (data.septum?.includes('Deviated')) suggestions.push('Nasal Septal Deviation');
                if (data.septum?.includes('Septal Spur')) suggestions.push('Septal Spur');
                if (data.septum?.includes('Perforated')) suggestions.push('Septal Perforation');
                
                if (data.mucosa?.includes('Pale')) suggestions.push('Allergic Rhinitis');
                if (data.mucosa?.includes('Congested') || data.mucosa?.includes('Erythematous')) suggestions.push('Rhinitis');
                
                if (data.it?.includes('Hypertrophic') || data.mt?.includes('Hypertrophic')) suggestions.push('Turbinate Hypertrophy');
                if (data.it?.includes('Atrophic')) suggestions.push('Atrophic Rhinitis');
                
                if (data.mm?.includes('Polyp') || data.omc?.includes('Polyp') || data.mt?.includes('Polyp')) suggestions.push('Nasal Polyposis');
                if (data.mm?.includes('Discharge') || data.discharge?.includes('Purulent') || data.discharge?.includes('Mucopurulent')) suggestions.push('Sinusitis');
                
                if (data.nasopharynx?.includes('Mass')) suggestions.push('Nasopharyngeal Mass');
                if (data.nasopharynx?.includes('Adenoid Hypertrophy')) suggestions.push('Adenoid Hypertrophy');
                
                if (suggestions.length === 0) suggestions.push('Normal Endoscopy');
            } else if (currentReportType === 'laryngeal') {
                if (data.epiglottis?.includes('Mass')) suggestions.push('Epiglottic Mass');
                if (data.epiglottis?.includes('Omega-shaped')) suggestions.push('Laryngomalacia');
                
                if (data.vallecula?.includes('Mass')) suggestions.push('Vallecular Mass');
                if (data.vallecula?.includes('Cyst')) suggestions.push('Vallecular Cyst');
                
                if (data.pyriformSinuses?.includes('Mass')) suggestions.push('Pyriform Sinus Mass');
                if (data.pyriformSinuses?.includes('Pooling')) suggestions.push('Dysphagia');
                
                if (data.arytenoids?.includes('Mass')) suggestions.push('Arytenoid Mass');
                
                if (data.trueVocalCords?.includes('Nodule')) suggestions.push('Vocal Cord Nodules');
                if (data.trueVocalCords?.includes('Polyp')) suggestions.push('Vocal Cord Polyp');
                if (data.trueVocalCords?.includes('Cyst')) suggestions.push('Vocal Cord Cyst');
                if (data.trueVocalCords?.includes('Mass')) suggestions.push('Laryngeal Mass');
                if (data.trueVocalCords?.includes('Palsy') || data.trueVocalCords?.includes('Paralysis')) suggestions.push('Vocal Cord Paralysis');
                if (data.trueVocalCords?.includes('Ulcer')) suggestions.push('Contact Ulcer');
                if (data.trueVocalCords?.includes('Leukoplakia')) suggestions.push('Leukoplakia');
                
                if (data.vocalCordMobility && (data.vocalCordMobility.includes('Fixed') || data.vocalCordMobility.includes('Paralysis'))) suggestions.push('Vocal Cord Fixation/Paralysis');
                
                if (data.subglottis?.includes('Stenosis')) suggestions.push('Subglottic Stenosis');
                if (data.subglottis?.includes('Mass')) suggestions.push('Subglottic Mass');

                if (data.arytenoids?.includes('Erythematous') || data.arytenoids?.includes('Edematous') || 
                    data.trueVocalCords?.includes('Erythematous') || data.trueVocalCords?.includes('Edematous')) {
                    if (!suggestions.includes('Laryngopharyngeal Reflux (LPR)')) {
                        suggestions.push('Laryngopharyngeal Reflux (LPR)');
                    }
                }

                if (suggestions.length === 0) suggestions.push('Normal Laryngoscopy');
            }

            return suggestions.join(', ');
        };

        const generateRecommendation = () => {
            const data = getFormData();
            let recs = [];

            if (currentReportType === 'nasal') {
                if (data.discharge?.includes('Purulent') || data.discharge?.includes('Mucoid') || data.discharge?.includes('Mucopurulent') ||
                    data.mucosa?.includes('Congested') || data.mm?.includes('Discharge') || data.omc?.includes('Discharge')) {
                    recs.push('Medical Management (Antibiotics/Decongestants)');
                    recs.push('Nasal Saline Irrigation');
                }
                
                if (data.mucosa?.includes('Pale') || data.it?.includes('Hypertrophic')) {
                    recs.push('Intranasal Corticosteroids');
                    recs.push('Antihistamines');
                    recs.push('Avoidance of allergens');
                }

                if (data.mm?.includes('Polyp') || data.omc?.includes('Polyp') || data.mt?.includes('Polyp')) {
                    if (!recs.includes('Intranasal Corticosteroids')) recs.push('Intranasal Corticosteroids');
                    recs.push('CT Scan of Paranasal Sinuses');
                    recs.push('Consider FESS');
                }

                if (data.septum?.includes('Deviated') || data.septum?.includes('Spur')) {
                    recs.push('Septoplasty (if symptomatic)');
                }

                if (data.nasopharynx?.includes('Mass') || data.nasopharynx?.includes('Ulcer')) {
                    recs.push('Biopsy');
                    recs.push('CT Scan / MRI');
                }

            } else if (currentReportType === 'laryngeal') {
                if (data.arytenoids?.includes('Erythematous') || data.arytenoids?.includes('Edematous') || 
                    data.trueVocalCords?.includes('Erythematous') || data.trueVocalCords?.includes('Edematous')) {
                    recs.push('Proton Pump Inhibitors (PPI)');
                    recs.push('Dietary Modification');
                    recs.push('Lifestyle Changes');
                    recs.push('Voice Rest');
                }

                if (data.trueVocalCords?.includes('Nodule')) {
                    recs.push('Voice Rest');
                    recs.push('Voice Therapy');
                }

                if (data.trueVocalCords?.includes('Polyp') || data.trueVocalCords?.includes('Cyst')) {
                    recs.push('Microlaryngeal Surgery');
                }

                if (data.trueVocalCords?.includes('Mass') || data.epiglottis?.includes('Mass') || 
                    data.vallecula?.includes('Mass') || data.pyriformSinuses?.includes('Mass')) {
                    recs.push('Direct Laryngoscopy with Biopsy');
                    recs.push('CT Scan of Neck');
                }

                if (data.trueVocalCords?.includes('Palsy') || data.trueVocalCords?.includes('Paralysis') || (data.vocalCordMobility && (data.vocalCordMobility.includes('Fixed') || data.vocalCordMobility.includes('Paralysis')))) {
                    recs.push('CT Scan (Skull Base to Chest)');
                    recs.push('Voice Therapy');
                }
            }

            if (recs.length === 0) recs.push('Follow up as needed');
            return [...new Set(recs)].join('; ');
        };

        // 2. Helper to inject "Auto" button
        const injectAutoButton = (inputId, generatorFn) => {
            const input = document.getElementById(inputId);
            if (!input || input.parentNode.classList.contains('input-auto-wrapper')) return;

            // Create Wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'input-auto-wrapper';
            Object.assign(wrapper.style, {
                display: 'flex', alignItems: 'center', width: '100%', marginBottom: '15px', position: 'relative'
            });

            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);

            input.style.marginBottom = '0';
            input.style.flex = '1';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.innerHTML = '⚡';
            btn.title = 'Auto-Generate from Findings';
            Object.assign(btn.style, {
                marginLeft: '8px', padding: '0', width: '40px', height: '38px',
                cursor: 'pointer', backgroundColor: '#f39c12', color: 'white',
                border: 'none', borderRadius: '50%', fontSize: '20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '40px', boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease'
            });
            btn.onmouseover = () => { btn.style.transform = 'scale(1.1)'; };
            btn.onmouseout = () => { btn.style.transform = 'scale(1)'; };

            btn.onclick = () => {
                const newVal = generatorFn();
                input.value = newVal;
                input.dispatchEvent(new Event('input'));
                
                const originalBg = input.style.backgroundColor;
                input.style.transition = 'background-color 0.3s';
                input.style.backgroundColor = 'rgba(243, 156, 18, 0.2)';
                setTimeout(() => {
                    input.style.backgroundColor = originalBg;
                    input.style.transition = '';
                }, 800);
            };

            wrapper.appendChild(btn);
        };

        // 3. Initialize
        if (impressionInput) injectAutoButton('impression', generateImpression);
        if (recommendationInput) injectAutoButton('recommendation', generateRecommendation);

        // 4. Keep existing "Auto Impression" button working if it exists in HTML
        const oldAutoBtn = document.getElementById('autoImpressionBtn');
        if (oldAutoBtn && impressionInput) {
            oldAutoBtn.addEventListener('click', () => {
                impressionInput.value = generateImpression();
                impressionInput.dispatchEvent(new Event('input'));
            });
        }

        // Auto-update if empty or default
        const findingsInputs = document.querySelectorAll('.findings-fieldset input, .findings-fieldset select');
        findingsInputs.forEach(input => {
            input.addEventListener('change', () => {
                if (impressionInput) {
                    const currentVal = impressionInput.value.trim();
                    // Only auto-update if empty or if it contains the default "Normal" text
                    if (currentVal === '' || currentVal === 'Normal Endoscopy' || currentVal === 'Normal Laryngoscopy') {
                        impressionInput.value = generateImpression();
                        impressionInput.dispatchEvent(new Event('input'));
                    }
                }
            });
        });
    }

    // ===================================================================================
    // ADD CLEAR BUTTONS TO INPUTS
    // ===================================================================================
    function addClearButtonsToInputs() {
        const inputs = document.querySelectorAll('#report-form input[type="text"], #report-form input[type="number"], #report-form textarea');
        
        inputs.forEach(input => {
            if (input.dataset.hasClearBtn) return;
            if (input.type === 'hidden' || input.type === 'file') return;
            if (input.readOnly) return;

            let lastValue = ''; // To store the value before clearing for undo

            const clearBtn = document.createElement('div');
            clearBtn.textContent = "Clear Field";
            clearBtn.className = "no-print";
            Object.assign(clearBtn.style, {
                fontSize: '10px',
                color: 'var(--primary-color)', // Changed to Primary Color (Blue)
                cursor: 'pointer',
                textAlign: 'right',
                marginTop: '-12px', // Pull up closer to input
                marginRight: '2px',
                display: 'none', // Hidden by default
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                userSelect: 'none'
            });

            const undoBtn = document.createElement('div');
            undoBtn.textContent = "Undo";
            undoBtn.className = "no-print";
            Object.assign(undoBtn.style, {
                fontSize: '10px',
                color: 'var(--secondary-color)', // Gray color for undo
                cursor: 'pointer',
                textAlign: 'right',
                marginTop: '-12px', // Pull up closer to input
                marginRight: '2px',
                display: 'none', // Hidden by default
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                userSelect: 'none'
            });

            const updateVisibility = () => {
                if (input.value && input.value.trim() !== '') {
                    clearBtn.style.display = 'block';
                    undoBtn.style.display = 'none'; // Hide undo if content is present
                } else {
                    clearBtn.style.display = 'none';
                    // Only show undo if there's a stored value
                    undoBtn.style.display = lastValue && lastValue.trim() !== '' ? 'block' : 'none';
                }
            };
            updateVisibility();

            input.addEventListener('input', updateVisibility);
            
            clearBtn.addEventListener('click', () => {
                lastValue = input.value; // Store current value before clearing
                input.value = '';
                input.dispatchEvent(new Event('input')); // Trigger auto-save
                updateVisibility();
                input.focus();
            });

            undoBtn.addEventListener('click', () => {
                input.value = lastValue; // Restore value
                input.dispatchEvent(new Event('input')); // Trigger auto-save
                updateVisibility(); // This will show clearBtn again and hide undoBtn
                input.focus();
            });

            let target = input;
            if (input.parentNode.classList.contains('input-auto-wrapper')) {
                target = input.parentNode;
            }

            if (target.parentNode) {
                target.parentNode.insertBefore(clearBtn, target.nextSibling);
                target.parentNode.insertBefore(undoBtn, clearBtn.nextSibling); // Place undo after clear
                input.dataset.hasClearBtn = "true";
            }
        });
    }

    // ===================================================================================
    // 6. CLEAR FORM FUNCTION
    // ===================================================================================
    // New helper function to clear form without confirmation
    function clearFormWithoutConfirmation(saveBackup = false) {
        // Reset all form elements
        if (reportForm) { // Ensure reportForm exists before trying to access its elements
            
            // NEW: Save state for Undo
            if (saveBackup) {
                lastClearedData = getFormData();
                const undoBtn = document.getElementById('undoClearBtn');
                if (undoBtn) undoBtn.style.display = 'inline-flex';
            }

            const formElements = reportForm.elements;
            for (let i = 0; i < formElements.length; i++) {
                const element = formElements[i];
                if (element.type !== 'file' && element.tagName !== 'BUTTON') {
                    if (element.id === 'procedureDate') {
                        element.value = getTodayDate();
                    } else {
                        element.value = '';
                    }
                }
            }
            // Clear images
            selectedImages = [];
            refreshPreview();
        }
    }

    function clearForm(withConfirmation = false) {
        // *** FIX: Prevent error on pages without a form ***
        if (!reportForm) {
            console.warn("clearForm called on a page with no report form.");
            return;
        }

        if (withConfirmation) {
            showCustomConfirm('Are you sure you want to clear all form data? You can undo this action.', (confirmed) => {
                if (confirmed) clearFormWithoutConfirmation(true);
            }, "Clear Form");
        } else {
            clearFormWithoutConfirmation(true);
        }
    }


    // Helper function to get today's date in YYYY-MM-DD format
    function getTodayDate() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    // Helper function to format date for display (MM/DD/YYYY)
    function formatDateForDisplay(dateString) {
        if (!dateString) return '';
        const parts = dateString.split('-');
        if (parts.length !== 3) return dateString;
        return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }

    // Initialize date field if it exists and is empty
    const procedureDateInput = document.getElementById('procedureDate');
    if (procedureDateInput && !procedureDateInput.value) {
        procedureDateInput.value = getTodayDate();
    }

    // Function to generate Nasal Findings HTML
    function getNasalFindingsHtml(data) {
        return `
            <h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Nasal Findings</h3>
            <p style="margin: 0;"><strong>Septum:</strong> ${data.septum || 'Normal'}</p>
            <p style="margin: 0;"><strong>Discharge:</strong> ${data.discharge || 'None'}</p>
            <p style="margin: 0;"><strong>Mucosa:</strong> ${data.mucosa || 'Normal'}</p>
            <p style="margin: 0;"><strong>Inferior Turbinate:</strong> ${data.it || 'Normal'}</p>
            <p style="margin: 0;"><strong>Middle Turbinate:</strong> ${data.mt || 'Normal'}</p>
            <p style="margin: 0;"><strong>Middle Meatus:</strong> ${data.mm || 'Clear'}</p>
            <p style="margin: 0;"><strong>Inferior Meatus:</strong> ${data.im || 'Clear'}</p>
            <p style="margin: 0;"><strong>Ostiomeatal Complex:</strong> ${data.omc || 'Normal'}</p>
            <p style="margin: 0;"><strong>Nasopharynx:</strong> ${data.nasopharynx || 'Normal'}</p>
        `;
    }

    // Function to generate Laryngeal Findings HTML
    function getLaryngealFindingsHtml(data) {
        return `
            <h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Laryngeal Findings</h3>
            <p style="margin: 0;"><strong>Epiglottis:</strong> ${data.epiglottis || 'Normal'}</p>
            <p style="margin: 0;"><strong>Vallecula:</strong> ${data.vallecula || 'Clear'}</p>
            <p style="margin: 0;"><strong>Pyriform Sinuses:</strong> ${data.pyriformSinuses || 'Clear'}</p>
            <p style="margin: 0;"><strong>Arytenoids:</strong> ${data.arytenoids || 'Mobile'}</p>
            <p style="margin: 0;"><strong>False Vocal Cords:</strong> ${data.falseVocalCords || 'Normal'}</p>
            <p style="margin: 0;"><strong>True Vocal Cords:</strong> ${data.trueVocalCords || 'Normal'}</p>
            <p style="margin: 0;"><strong>Vocal Cord Mobility:</strong> ${data.vocalCordMobility || 'Symmetrical and mobile'}</p>
            <p style="margin: 0;"><strong>Subglottis:</strong> ${data.subglottis || 'Normal'}</p>
        `;
    }

    /**
     * Converts an image URL to a base64 data URI.
     * This is crucial for html2canvas to reliably render local images.
     * @param {string} url The URL of the image.
     * @returns {Promise<string>} A promise that resolves with the base64 data URI.
     */
    function imageToBase64(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // img.crossOrigin = 'Anonymous'; // REMOVED: Causes issues with local file:// protocol
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                try {
                    const dataURL = canvas.toDataURL('image/png');
                    resolve(dataURL);
                } catch (e) {
                    console.warn("Image taint check failed. Returning empty to prevent canvas taint.", e);
                    resolve(''); // Return empty string so PDF generation succeeds (even without logo)
                }
            };
            img.onerror = (error) => {
                console.error(`Failed to load image at: ${url}`, error);
                // Resolve with an empty string or a placeholder if the image fails to load
                resolve(''); 
            };
            img.src = url;
        });
    }

    // NEW: Helper function to build the image column HTML
    function buildImageColumnHtml(availableHeightPx = 800) {
        if (selectedImages.length === 0) {
            return '';
        }

        // Limit to a maximum of 6 images and ensure they are valid strings
        const imagesToPrint = selectedImages.filter(img => typeof img === 'string' && img.length > 0).slice(0, 6);
        const numImages = imagesToPrint.length;

        // Define the maximum available height for the image panel in pixels.
        const maxImagePanelHeightPx = availableHeightPx; 
        const imageGapPx = 10; // Gap between images

        let individualImageMaxHeightPx;
        if (numImages <= 2) {
            individualImageMaxHeightPx = 250;
        } else {
            const totalGaps = (numImages - 1) * imageGapPx;
            individualImageMaxHeightPx = (maxImagePanelHeightPx - totalGaps) / numImages;
        }
        
        individualImageMaxHeightPx = Math.max(individualImageMaxHeightPx, 60); // Minimum 60px height
        
        const savedSettings = JSON.parse(localStorage.getItem('clinicSettings') || '{}');
        const objectFit = savedSettings.imageObjectFit || 'cover';

        // NEW APPROACH: Create a container for each image with a fixed height.
        // Changed object-fit to 'contain' so the whole image is visible regardless of aspect ratio.
        const imageElements = imagesToPrint.map(base64 => 
            `
            <div class="image-container" style="width: 100%; height: ${individualImageMaxHeightPx}px; margin-bottom: ${imageGapPx}px; display: flex; justify-content: center; align-items: center; background-color: var(--image-bg, #f0f0f0); border-radius: 4px; overflow: hidden;">
                <img src="${base64}" alt="Endoscopy Image" style="width: 100%; height: 100%; object-fit: ${objectFit};">
            </div>
            `
        ).join('');

        return `
            <h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Endoscopy Images (${numImages})</h3>
            <div class="image-column" style="max-height: ${maxImagePanelHeightPx}px; overflow: hidden; display: flex; flex-direction: column;">
                ${imageElements}
            </div>
        `;
    }

    // Helper to build all report sections
    function buildReportSections(data, findingsHtml) {
        // NEW: Formatter for Procedure Description to create clean lists for printing
        function formatProcedureDescription(text) {
            if (!text) return '';
            const safeText = escapeHtml(text);
            
            // Check if it contains bullet points (•) which indicates a list structure
            if (safeText.includes('•')) {
                const lines = safeText.split('\n');
                let html = '';
                let inList = false;
                
                lines.forEach(line => {
                    let trimmed = line.trim();
                    if (!trimmed) return; // Skip empty lines
                    
                    if (trimmed.startsWith('•')) {
                        if (!inList) {
                            html += '<ul style="margin: 5px 0 5px 0; padding-left: 25px; list-style-type: disc;">';
                            inList = true;
                        }
                        // Remove bullet and bold specific keys if present
                        let content = trimmed.substring(1).trim();
                        // Bold "First Pass:", "Second Pass:", etc.
                        content = content.replace(/^(First Pass:|Second Pass:|Third Pass:)/i, '<strong>$1</strong>');
                        html += `<li style="margin-bottom: 2px;">${content}</li>`;
                    } else {
                        if (inList) {
                            html += '</ul>';
                            inList = false;
                        }
                        html += `<p style="margin: 0 0 5px 0;">${trimmed}</p>`;
                    }
                });
                
                if (inList) html += '</ul>';
                return html;
            }
            
            // Fallback: Just preserve whitespace
            return `<span style="white-space: pre-wrap;">${safeText}</span>`;
        }

        const dateStr = formatDateForDisplay(data.procedureDate) || formatDateForDisplay(getTodayDate());
        const metaWidth = '120px'; // Reduced width to remove excess space on the right of Date

        const procedureDescHtml = data.procedureDescription ? 
            `<div style="margin-top: 4px; margin-bottom: 6px;" id="procedureDescriptionSection">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <strong class="procedure-description-label">Procedure Description:</strong>
                    <div style="width: ${metaWidth}; text-align: left; white-space: nowrap;"><strong>Date:</strong> ${dateStr}</div>
                </div>
                <div style="margin-top: 2px; line-height: 1.4;">${formatProcedureDescription(data.procedureDescription)}</div>
             </div>` : `<div style="margin-top: 4px; margin-bottom: 6px; display: flex; justify-content: flex-end;"><div style="width: ${metaWidth}; text-align: left; white-space: nowrap;"><strong>Date:</strong> ${dateStr}</div></div>`;

        const reportContent = `
            <h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Patient Information</h3>
            <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-bottom: 4px; line-height: 1.4;">
                <tbody>
                    <tr>
                        <td style="padding: 0 5px 2px 0;"><strong>Name:</strong> ${escapeHtml(data.patientName) || 'N/A'}</td>
                        <td style="padding: 0 0 2px 0; text-align: right;">
                            <div style="display: inline-block; width: ${metaWidth}; text-align: left; white-space: nowrap;"><strong>Sex:</strong> ${escapeHtml(data.patientSex) || 'N/A'}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 5px 2px 0;" colspan="2"><strong>Age:</strong> ${escapeHtml(data.patientAge) || 'N/A'}</td>
                    </tr>
                </tbody>
            </table>
            
            <h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Procedure Details</h3>
            <p style="margin: 0 0 4px 0;"><strong>Indication:</strong> ${escapeHtml(data.indication) || 'N/A'}</p>
            <p style="margin: 0 0 4px 0;"><strong>Anesthesia:</strong> ${escapeHtml(data.anesthesiaUsed) || 'N/A'}</p>
            
            ${findingsHtml}
            
            <h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Impression / Diagnosis</h3>
            <p style="margin: 0 0 4px 0;">${escapeHtml(data.impression) || 'N/A'}</p>

            <h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Recommendation / Plan</h3>
            <p style="margin: 0 0 4px 0;">${escapeHtml(data.recommendation) || 'N/A'}</p>
        `;

        // Insert procedure description after "Procedure Details"
        const finalReportContent = reportContent.replace('<h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Procedure Details</h3>', `<h3 style="font-size: 15px; margin: 10px 0 5px 0; border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 3px;">Procedure Details</h3>${procedureDescHtml}`);

        // NOTE: imageContainerHTML is removed from here as it's handled by addImagesToPdf

        const physicianFullName = data.physician || '';

        // Re-add the physician block (Text Only, No E-Signature Image)
        const physicianBlock = `
            <div class="doctor-signature-section" style="margin-top: 20px; text-align: left; page-break-inside: avoid;">
                <div style="display: inline-block; min-width: 200px; text-align: center;">
                    <div style="height: 50px; border-bottom: 1px solid var(--text-color, #333); margin-bottom: 2px;"></div>
                    <strong class="physician-name" style="margin: 0; padding: 0; font-size: 13px; white-space: nowrap; display: block;">${escapeHtml(physicianFullName)}</strong>
                    <span style="margin: 0; padding: 0; font-size: 11px; display: block;">Attending Physician</span>
                </div>
            </div>
        `;

        // Return content with physician block appended
        return { reportContent: finalReportContent + physicianBlock };
    }

    // ===================================================================================
    // VIDEO DIAGNOSTIC TEST MODE (CANVAS RENDERER)
    // ===================================================================================
    const videoTestBtn = document.getElementById('videoTestBtn');
    if (videoTestBtn) {
        videoTestBtn.addEventListener('click', () => {
            // 1. Create File Input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // 2. Create Test Modal
                const modal = document.createElement('div');
                Object.assign(modal.style, {
                    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '10000', display: 'flex',
                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                });

                // 3. Create Elements
                const header = document.createElement('h3');
                header.textContent = "Video Test Mode (Canvas Renderer)";
                header.style.color = 'white';
                header.style.marginBottom = '10px';

                // Hidden Video Element (Source)
                const video = document.createElement('video');
                video.src = URL.createObjectURL(file);
                video.muted = true;
                video.playsInline = true;
                video.autoplay = true;
                video.loop = true;
                video.style.display = 'none'; // Hide the actual video element

                // Visible Canvas Element (Display)
                const canvas = document.createElement('canvas');
                Object.assign(canvas.style, {
                    maxWidth: '90%', maxHeight: '60vh', border: '2px solid #fff',
                    backgroundColor: '#000'
                });

                const controlsDiv = document.createElement('div');
                controlsDiv.style.marginTop = '20px';
                controlsDiv.style.display = 'flex';
                controlsDiv.style.gap = '10px';

                const captureBtn = document.createElement('button');
                captureBtn.textContent = '📸 Capture from Canvas';
                
                const closeBtn = document.createElement('button');
                closeBtn.textContent = 'Close';
                closeBtn.className = 'btn-secondary';

                controlsDiv.appendChild(captureBtn);
                controlsDiv.appendChild(closeBtn);
                modal.appendChild(header);
                modal.appendChild(canvas); // We append canvas, NOT video
                modal.appendChild(video);
                modal.appendChild(controlsDiv);
                document.body.appendChild(modal);

                // 4. Render Loop (The Magic Part)
                let animationId;
                const ctx = canvas.getContext('2d');

                const renderFrame = () => {
                    if (video.paused || video.ended) {
                        // Still loop to catch updates if paused but seeking
                    }
                    
                    if (video.readyState >= 2) {
                        // Set canvas size to match video once ready
                        if (canvas.width !== video.videoWidth) {
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                        }
                        // Draw video frame to canvas
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    }
                    animationId = requestAnimationFrame(renderFrame);
                };

                video.play().then(() => {
                    renderFrame();
                }).catch(err => {
                    console.error(err);
                    alert("Autoplay failed. Please interact with the page.");
                });

                // 5. Capture Logic
                captureBtn.onclick = () => {
                    try {
                        const dataUrl = canvas.toDataURL('image/png');
                        // Download for testing
                        const a = document.createElement('a');
                        a.href = dataUrl;
                        a.download = 'test-capture.png';
                        a.click();
                        alert("Image captured and downloaded! Check if it's black or visible.");
                    } catch (e) {
                        alert("Capture failed: " + e.message);
                    }
                };

                closeBtn.onclick = () => {
                    cancelAnimationFrame(animationId);
                    video.pause();
                    URL.revokeObjectURL(video.src);
                    document.body.removeChild(modal);
                };
            };
            input.click();
        });
    }

    /**
     * NEW: Centralized function to build the complete HTML for the print header.
     * This avoids code duplication between native print and PDF generation.
     * @param {object} savedSettings - The clinic settings object from localStorage.
     * @param {object} logos - An object containing the base64 logo strings.
     * @returns {string} The complete HTML string for the header.
     */
    function getPrintHeaderHtml(savedSettings, logos) {
        // Get Styling Settings with defaults
        const headerFont = savedSettings.headerFontFamily || 'Arial, sans-serif';
        const logoSize = savedSettings.logoSize || '100';
        const hospSize = savedSettings.hospitalNameFontSize || '25';
        const hospBold = (savedSettings.hospitalNameBold !== false) ? 'bold' : 'normal';
        const subSize = savedSettings.subtitleFontSize || '12';
        const subBold = (savedSettings.subtitleBold === true) ? 'bold' : 'normal';
        const clinicSize = savedSettings.clinicNameFontSize || '16';
        const clinicBold = (savedSettings.clinicNameBold !== false) ? 'bold' : 'normal';
        const addrSize = savedSettings.addressFontSize || '12';
        const addrBold = (savedSettings.addressBold === true) ? 'bold' : 'normal';
        const contactNoSize = savedSettings.contactNoFontSize || '12';
        const contactNoBold = (savedSettings.contactNoBold === true) ? 'bold' : 'normal';

        // Determine which logos to use
        const selectedHospital = savedSettings.hospitalHeader || 'rever';
        const leftLogoSrc = savedSettings.leftLogo || (selectedHospital === 'capitol' ? logos.cumc : logos.left);
        const rightLogoSrc = savedSettings.rightLogo || logos.right;

        // Determine header text content
        let hospitalNameLine = selectedHospital; // Default to value
        if (selectedHospital === 'rever') {
            hospitalNameLine = 'REVER MEDICAL CENTER INC.';
        } else if (selectedHospital === 'capitol') {
            hospitalNameLine = 'CAPITOL UNIVERSITY MEDICAL CENTER';
        }

        const clinicName = savedSettings.clinicName || 'ENT-HNS ENDOSCOPY UNIT';
        let address = savedSettings.clinicAddress !== undefined ? savedSettings.clinicAddress : '';
        const phone = savedSettings.clinicPhoneNumber || '';
        if (selectedHospital === 'capitol' && !address) {
            address = 'Gusa Highway, Cagayan de Oro City, Misamis Oriental';
        } else if (selectedHospital === 'rever' && !address) {
            address = 'Zone 4, Capunuyan, Aplaya, Jasaan, Misamis Oriental';
        }

        const rehabTextRaw = savedSettings.rehabCenterText !== undefined ? savedSettings.rehabCenterText : 'MINDANAO EAR, NOSE, THROAT OUT-PATIENT REHABILITATION CENTER\n(MENTOR)';
        const rehabText = rehabTextRaw.replace(/\n/g, '<br>');

        // Use the hidden template to build the header
        const template = document.getElementById('printHeaderTemplate');
        if (!template) return ''; // Safety check

        const headerContainer = document.createElement('div');
        headerContainer.innerHTML = template.innerHTML;

        // CUMC Specific Margin/Padding Logic
        if (selectedHospital === 'capitol') {
            // Add padding to the container to prevent logos from touching edges
            headerContainer.querySelector('.print-header-container').style.padding = '0 20px';
        }

        // Populate logos
        headerContainer.querySelector('img[alt="Left Logo"]').src = leftLogoSrc;
        headerContainer.querySelector('img[alt="Right Logo"]').src = rightLogoSrc;
        headerContainer.querySelectorAll('img').forEach(img => {
            img.style.width = `${logoSize}px`;
            img.style.height = `${logoSize}px`;
        });

        // Populate text block
        const textBlock = headerContainer.querySelector('.header-text-block');
        textBlock.style.fontFamily = headerFont;
        textBlock.innerHTML = `
            <div style="margin-bottom: 5px; line-height: 1.2; text-align: center;">
                <span class="hospital-name-span" style="font-weight: ${hospBold}; font-size: ${hospSize}px; white-space: nowrap; display: inline-block;">${escapeHtml(hospitalNameLine)}</span><br>
                <span class="subtitle-span" style="font-weight: ${subBold}; font-size: ${subSize}px; white-space: nowrap;">${rehabText}</span><br>
                <span style="font-weight: ${clinicBold}; font-size: ${clinicSize}px;">${escapeHtml(clinicName)}</span><br>
                <span style="font-weight: ${addrBold}; font-size: ${addrSize}px;">${escapeHtml(address)}</span>
                ${phone ? `<br><span style="font-weight: ${contactNoBold}; font-size: ${contactNoSize}px;">Contact No. || ${phone}</span>` : ''}
            </div>`;

        return headerContainer.innerHTML;
    }

    /**
     * Prepares the content and triggers the native browser print dialog.
     * This allows the user to choose their printer and settings.
     */
    async function handleNativePrint() {
        // Show spinner to indicate loading
        if (loadingSpinner) {
            const p = loadingSpinner.querySelector('p');
            if (p) p.textContent = "Preparing Print Preview...";
            loadingSpinner.style.display = 'flex';
        }

        const data = getFormData();
        const pageTitle = document.title;
        let findingsHtml = '';
        let reportTypeDisplay = '';

        if (pageTitle.includes('Nasal')) {
            findingsHtml = getNasalFindingsHtml(data);
            reportTypeDisplay = 'NASAL ENDOSCOPY REPORT';
        } else if (pageTitle.includes('Laryngeal')) {
            findingsHtml = getLaryngealFindingsHtml(data);
            reportTypeDisplay = 'LARYNGEAL ENDOSCOPY REPORT';
        }

        // Build the report sections
        const { reportContent } = buildReportSections(data, findingsHtml);

        // Load settings
        const savedSettings = JSON.parse(localStorage.getItem('clinicSettings') || '{}');

        // NEW: Use the centralized function to build the header.
        // For native print, we can use file paths directly as the browser will resolve them.
        const headerHTML = getPrintHeaderHtml(savedSettings, {
            left: 'image/rmci-logo.png',
            right: 'image/ent-logo.webp',
            cumc: 'image/cumc-logo.png'
        });
        
        // NEW: Build the image column HTML
        const imageColumnHTML = buildImageColumnHtml(800);

        const finalHtml = `
            ${headerHTML}
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 15px; font-size: 18px; font-weight: bold; margin: 10px 0; background-color: #2c3e50; color: white; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                <span>${reportTypeDisplay}</span>
                <span>OPERATIVE RECORD</span>
            </div>
            <div class="print-layout-container" style="display: flex; gap: 15px; font-size: 12px; padding: 0 15px; margin-bottom: 10px; line-height: 1.3; color: black; height: 850px; overflow: hidden;">
                <div class="print-content-panel" style="flex: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
                    ${reportContent}
                </div>
                <div class="print-image-panel" style="width: 300px; flex-shrink: 0; overflow: hidden;">
                    ${imageColumnHTML}
                </div>
            </div>
        `;

        // 1. Populate the hidden div that the browser will use for printing
        // RESET STYLES: Ensure no leftover styles from PDF generation (like fixed width) affect native print
        printDiv.style.cssText = ''; 
        
        printDiv.innerHTML = finalHtml;
        printDiv.style.display = 'block';

        // NEW: Adjust font size for Native Print to prevent clipping
        const hospitalNameSpanNative = printDiv.querySelector('.hospital-name-span');
        const subtitleSpanNative = printDiv.querySelector('.subtitle-span');
        const textBlockContainerNative = printDiv.querySelector('.header-text-block');
        adjustFontSizeToFit(hospitalNameSpanNative, textBlockContainerNative);
        adjustFontSizeToFit(subtitleSpanNative, textBlockContainerNative);

        // Adjust physician name font size to fit in one line
        const physicianNameNative = printDiv.querySelector('.physician-name');
        const physicianContainerNative = printDiv.querySelector('.doctor-signature-section');
        adjustFontSizeToFit(physicianNameNative, physicianContainerNative);

        // NEW: Wait for all images to fully load before printing
        // This fixes the issue where logos/images are missing on the first print attempt
        const images = Array.from(printDiv.querySelectorAll('img'));
        await Promise.all(images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve; // Resolve even on error so we don't get stuck
            });
        }));

        // Small buffer to ensure rendering is complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Hide spinner right before opening the dialog
        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
            const p = loadingSpinner.querySelector('p');
            if (p) p.textContent = "Generating PDF..."; // Reset to default
        }

        window.print();

        // 3. This code runs AFTER the print dialog is closed.
        printDiv.style.display = 'none';
        printDiv.innerHTML = ''; // Clean up the print content
    }

    async function printReport(options = {}) {
        const { isForEmail = false, paperFormat = 'A4', showPreview = false } = options;
        
        // Show spinner
        if (loadingSpinner) loadingSpinner.style.display = 'flex';

        const data = getFormData();
        const pageTitle = document.title; // e.g., "Nasal Endoscopy Report" or "Laryngeal Endoscopy Report"
        let findingsHtml = '';
        let reportTypeDisplay = '';
        let pdfFilename = 'Endoscopy_Report.pdf';

        if (pageTitle.includes('Nasal')) {
            findingsHtml = getNasalFindingsHtml(data);
            reportTypeDisplay = 'NASAL ENDOSCOPY REPORT';
            // SANITIZE FILENAME: Remove special characters that break file systems
            const safeName = data.patientName ? data.patientName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : 'Nasal';
            pdfFilename = `${safeName}_Endoscopy_Report.pdf`;
        } else if (pageTitle.includes('Laryngeal')) {
            findingsHtml = getLaryngealFindingsHtml(data);
            reportTypeDisplay = 'LARYNGEAL ENDOSCOPY REPORT';
            const safeName = data.patientName ? data.patientName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : 'Laryngeal';
            pdfFilename = `${safeName}_Endoscopy_Report.pdf`;
        }

        // Ensure savedSettings is available
        const savedSettings = JSON.parse(localStorage.getItem('clinicSettings') || '{}');

        // NEW: Use the centralized function to build the header.
        // For PDF generation, we must use the pre-loaded Base64 strings to ensure they are embedded correctly.
        const headerHTML = getPrintHeaderHtml(savedSettings, {
            left: defaultLeftLogoBase64,
            right: defaultRightLogoBase64,
            cumc: defaultCUMCLogoBase64
        });

        // Build the report sections
        const { reportContent } = buildReportSections(data, findingsHtml);
        
        // Calculate dimensions based on paper format (96 DPI)
        let pdfPageWidthPx = 794; // A4 Default
        let pdfPageHeightPx = 1123; // A4 Default
        
        if (paperFormat === 'Letter') {
            pdfPageWidthPx = 816;
            pdfPageHeightPx = 1056;
        } else if (paperFormat === 'Legal') {
            pdfPageWidthPx = 816;
            pdfPageHeightPx = 1344;
        }
        
        // Calculate available height for images relative to A4 ratio
        // A4 Page Height = 1123px. Content Container = 850px. Ratio ~ 0.75.
        const containerHeight = Math.floor(pdfPageHeightPx * 0.75);

        // Build the image column with dynamic height
        const imageColumnHTML = buildImageColumnHtml(containerHeight - 50);

        // Watermark text
        const watermarkText = "CONFIDENTIAL";

        // *** FIX: Calculate explicit widths for PDF layout ***
        // This ensures the layout in the PDF matches the selected paper size exactly.
        const containerPadding = 30; // 15px * 2
        const columnGap = 15;
        const usableWidth = pdfPageWidthPx - containerPadding - columnGap;
        const imageColWidth = 300;
        const contentColWidth = usableWidth - imageColWidth;

        // Populate the print-only div with the report content
        printDiv.innerHTML = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; font-weight: bold; color: rgba(128, 128, 128, 0.15); z-index: 0; white-space: nowrap; pointer-events: none;">${watermarkText}</div>
            <div style="position: relative; z-index: 1; width: 100%;">
                <div style="width: 100%;">${headerHTML}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 15px; font-size: 18px; font-weight: bold; margin: 10px 0; background-color: #2c3e50; color: white; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                    <span>${reportTypeDisplay}</span>
                    <span>OPERATIVE RECORD</span>
                </div>
                <div class="print-layout-container" style="display: flex; gap: 15px; font-size: 12px; padding: 0 15px; margin-bottom: 10px; line-height: 1.3; height: ${containerHeight}px; overflow: hidden;">
                    <div class="print-content-panel" style="width: ${contentColWidth}px; flex: none; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
                        ${reportContent}
                    </div>
                    <div class="print-image-panel" style="width: ${imageColWidth}px; flex: none; overflow: hidden;">
                        ${imageColumnHTML}
                    </div>
                </div>
            </div>
            `;

        // Determine colors based on current theme
        const isDarkMode = document.body.classList.contains('dark-mode');
        const themeStyles = isDarkMode ? 
            `--bg-color: #121212; --text-color: #e0e0e0; --border-color: #444; --image-bg: #2c2c2c;` : 
            `--bg-color: #ffffff; --text-color: #000000; --border-color: #eee; --image-bg: #f0f0f0;`;

        // *** KEY CHANGE: Force the printDiv to the selected paper aspect ratio before capture ***
        // FIX: Use 'position: fixed' and 'z-index: 9999' to prevent layout shifts on mobile during generation
        printDiv.style.cssText = `display: block; width: ${pdfPageWidthPx}px; background-color: var(--bg-color); color: var(--text-color); position: fixed; top: 0; left: 0; z-index: 9999; overflow: hidden; ${themeStyles}`;

        // *** NEW: Adjust font size after rendering in the fixed-width div ***
        const hospitalNameSpanForPdf = printDiv.querySelector('.hospital-name-span');
        const subtitleSpanForPdf = printDiv.querySelector('.subtitle-span');
        const textBlockContainerForPdf = printDiv.querySelector('.header-text-block');
        adjustFontSizeToFit(hospitalNameSpanForPdf, textBlockContainerForPdf);
        adjustFontSizeToFit(subtitleSpanForPdf, textBlockContainerForPdf);

        // Adjust physician name font size to fit in one line
        const physicianNamePdf = printDiv.querySelector('.physician-name');
        const physicianContainerPdf = printDiv.querySelector('.doctor-signature-section');
        adjustFontSizeToFit(physicianNamePdf, physicianContainerPdf);

        // Use a short timeout to allow the browser to render the printDiv
        // before html2canvas tries to capture it. This prevents blank/stuck PDFs.
        return new Promise((resolve, reject) => {
            // Safety timeout: Stop spinner if too long, but DO NOT print.
            const safetyTimeout = setTimeout(() => {
                if (loadingSpinner && loadingSpinner.style.display !== 'none') {
                    console.warn("PDF generation timed out.");
                    showCustomAlert("PDF generation is taking too long. Please check if the file is open or try again.", "Timeout");
                    if (loadingSpinner) loadingSpinner.style.display = 'none';
                    printDiv.style.width = 'auto'; // Reset width
                    printDiv.style.display = 'none';
                    resolve();
                }
            }, 15000);

            // Helper to load scripts dynamically
            const loadScript = (src) => {
                return new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = src;
                    s.onload = res;
                    s.onerror = rej;
                    document.head.appendChild(s);
                });
            };

            // Check and try to load if missing (Fallback to CDN)
            (async () => {
                if (typeof html2canvas !== 'function' || (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined')) {
                    console.warn("PDF libraries missing locally. Attempting CDN fallback...");
                    try {
                        if (typeof html2canvas !== 'function') await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
                        if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
                    } catch (e) {
                        console.error("CDN Fallback failed:", e);
                    }
                }

                setTimeout(() => {
                    // Check if libraries are loaded
                    if (typeof html2canvas === 'function' && (typeof window.jspdf !== 'undefined' || typeof window.jsPDF !== 'undefined')) {                    
                        // We removed `useCORS: true` because all images (logo, signature, uploads)
                        // are either local or base64 data URIs. `useCORS` can cause issues with these.
                        // We also added better error logging.
                        html2canvas(printDiv, { 
                            scale: 2, // Reduced scale to prevent memory crashes/hangs
                            logging: true, // Enable logging for debugging
                            useCORS: false, // Explicitly false for local files
                            allowTaint: false // Ensure we don't taint the canvas
                        }).then(canvas => {
                            clearTimeout(safetyTimeout); // Clear timeout on success
                            let imgData;
                            try {
                                imgData = canvas.toDataURL('image/png');
                            } catch (e) {
                                console.warn("Canvas tainted, unable to generate PDF.", e);
                                showCustomAlert("Unable to generate PDF due to image security restrictions. Please use a local server (Live Server).", "Security Error");
                                if (loadingSpinner) loadingSpinner.style.display = 'none';
                                printDiv.style.display = 'none';
                                resolve();
                                return;
                            }

                            // Robust way to get jsPDF constructor
                            const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
                            if (!jsPDF) throw new Error("jsPDF constructor not found");

                            const pdf = new jsPDF({
                                orientation: 'p',
                                unit: 'mm',
                                format: paperFormat.toLowerCase() // Use the selected paper size
                            });

                            const pdfWidth = pdf.internal.pageSize.getWidth();
                            const pdfHeight = pdf.internal.pageSize.getHeight();
                            const canvasAspectRatio = canvas.width / canvas.height;
                            const pdfAspectRatio = pdfWidth / pdfHeight;

                            let imgHeight = canvas.height * pdfWidth / canvas.width;
                            let heightLeft = imgHeight; 
                            let position = 0;

                            // Calculate total pages based on content height vs page height
                            const totalPages = Math.ceil(imgHeight / pdfHeight);

                            // Helper to add footer with page numbers
                            const addFooter = (pageNum) => {
                                const str = `Page ${pageNum} of ${totalPages}`;
                                pdf.setFontSize(9);
                                // Adjust footer color based on theme for better visibility
                                if (isDarkMode) {
                                    pdf.setTextColor(200, 200, 200); // Light Grey for Dark Mode
                                } else {
                                    pdf.setTextColor(80, 80, 80); // Dark Grey for Light Mode
                                }
                                pdf.text(str, pdfWidth / 2, pdfHeight - 10, { align: 'center' });
                            };

                            // Add the text content from the canvas
                            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
                            addFooter(1); // Add footer to the first page
                            heightLeft -= pdfHeight;

                            let pageCount = 1;
                            // Add more pages if the text content is very long
                            while (heightLeft > 0) {
                                position = heightLeft - imgHeight;
                                pdf.addPage(paperFormat.toLowerCase(), 'p');
                                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
                                pageCount++;
                                addFooter(pageCount); // Add footer to subsequent pages
                                heightLeft -= pdfHeight;
                            }

                            // The images are now part of the canvas, so we can proceed directly.
                            return { pdf, pdfFilename };
                        }).then(({ pdf, pdfFilename }) => {
                            if (showPreview) {
                                // Use blob for better compatibility
                                const pdfDataUri = pdf.output('bloburl');
                                pdfPreviewFrame.src = pdfDataUri;
                                pdfPreviewModal.style.display = 'flex';

                                generatedPdfForSave = { pdf, pdfFilename }; // Store for the save button
                                if (loadingSpinner) loadingSpinner.style.display = 'none';
                                // printDiv.style.display = 'none'; // Keep it hidden
                            } else if (!isForEmail) { 
                                pdf.save(pdfFilename);
                                if (loadingSpinner) loadingSpinner.style.display = 'none';
                                // printDiv.style.display = 'none';
                            }
                            
                            printDiv.style.display = 'none'; // Hide after processing
                            printDiv.style.width = 'auto'; // Reset width 
                            printDiv.innerHTML = ''; // Clean up the print content
                            printDiv.style.cssText = ''; // Fully reset styles
                            resolve({ pdf, pdfFilename }); // Resolve for email functionality
                        }).catch(err => {
                            clearTimeout(safetyTimeout); // Clear timeout on error
                            console.error("html2canvas error:", err);
                            // alert("An error occurred while generating the PDF. Please check the console (F12) for details.");
                            console.warn("PDF Generation Error");
                            if (loadingSpinner) loadingSpinner.style.display = 'none';
                            printDiv.style.display = 'none';
                            resolve(); // Resolve to prevent hanging
                            printDiv.style.width = 'auto'; // Reset width on error
                            printDiv.style.cssText = ''; // Fully reset styles
                            printDiv.innerHTML = ''; // Clean up the print content
                        });
                    } else {
                        clearTimeout(safetyTimeout);
                        showCustomAlert("PDF libraries not loaded. Please check your internet connection or ensure local files are in 'js/lib/'.", "Error");
                        setTimeout(() => {
                            printDiv.style.display = 'none';
                            if (loadingSpinner) loadingSpinner.style.display = 'none';
                            resolve();
                        }, 100);
                    }
                }, 200);
            })();
        });
    }

    // ===================================================================================
    // GLOBAL PASTE SUPPORT (Ctrl+V) - ALTERNATIVE FOR VIDEO ISSUES
    // ===================================================================================
    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let blob = null;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                blob = items[i].getAsFile();
                break;
            }
        }

        if (blob) {
            e.preventDefault(); // Prevent default paste behavior
            
            if (selectedImages.length >= 6) {
                showCustomAlert("Maximum of 6 images reached. Please remove an image to paste a new one.", "Limit Reached");
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const resized = await resizeImage(event.target.result);
                addBase64ToPreview(resized);
                showCustomAlert("Image pasted from clipboard successfully!", "Image Added");
            };
            reader.readAsDataURL(blob);
        }
    });

    // IMPORTANT: Expose functions globally if they are called via HTML inline attributes (e.g., onclick="saveFile()")
    // We no longer need to expose functions to the window object because we are using addEventListener.
    // This is a good practice to avoid polluting the global namespace.

});
