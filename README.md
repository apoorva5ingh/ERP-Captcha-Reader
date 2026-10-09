# ERP CAPTCHA Reader

[![Status](https://img.shields.io/badge/Status-Portfolio_Release-blue.svg)]()
[![Platform](https://img.shields.io/badge/Platform-Chrome_Extension-lightgrey.svg)]()

A lightweight, purpose-built Google Chrome extension designed to streamline authorized login workflows by providing OCR-assisted CAPTCHA recognition and automated text-field population for college Enterprise Resource Planning (ERP) systems. 

This project serves as a practical demonstration of browser automation, client-side image-to-text recognition, and Document Object Model (DOM) manipulation utilizing the Chrome Extensions API.

---

## 🚀 Core Features

| Capability | Description |
| :--- | :--- |
| **Optical Character Recognition** | Processes and deciphers visual CAPTCHA challenges utilizing integrated image-text recognition methodologies. |
| **Automated Data Entry** | Seamlessly maps and autofills recognized text strings directly into the designated CAPTCHA input fields. |
| **Workflow Optimization** | Reduces manual, repetitive data entry during authorized authentication sequences. |
| **Lightweight Integration** | Operates efficiently via the Chrome Extensions API with a minimal, non-intrusive user interface. |

## 🛠 Technology Stack

- **Core Logic:** JavaScript (ES6+)
- **Interface & Structure:** HTML5, CSS3
- **Browser Integration:** Manifest V3 / Chrome Extensions API
- **Processing:** Integrated OCR / Image-Text Recognition framework

## ⚙️ Installation Guide

**Note:** This extension is currently deployed as a public portfolio release and is not available via the Chrome Web Store. It must be installed locally via Developer Mode.

### Sideloading from GitHub

1. Navigate to the [ERP CAPTCHA Reader GitHub repository](https://github.com/apoorva5ingh/erp-captcha-reader).
2. Click **Code** > **Download ZIP** to acquire the project files.
3. Extract the downloaded `.zip` archive to a dedicated directory on your local machine. *(Ensure you open the inner folder containing the `manifest.json` file).*
4. Launch **Google Chrome** (or a compatible Chromium-based browser).
5. Navigate to your extensions management page by entering `chrome://extensions/` in the address bar.
6. Toggle **Developer mode** on in the top-right corner of the window.
7. Click the **Load unpacked** button in the top-left corner.
8. Select the extracted directory containing the `manifest.json` file.
9. The extension is now installed and will appear in your Chrome toolbar.

## 📖 Usage Instructions

1. Ensure the extension is enabled in your browser toolbar.
2. Navigate to your authorized college ERP login portal.
3. The extension will automatically detect the CAPTCHA element based on its configuration.
4. **Important:** Always review the OCR-recognized text for accuracy before submitting the authentication form, as recognition accuracy can vary based on image complexity.

## 🛡️ Security, Compliance & Responsible Use

This tool is strictly intended for workflow automation on systems you are explicitly authorized to access. 

* **Authorized Use Only:** Deploy this extension only in accordance with your institution's acceptable use and ERP security policies.
* **No Access Bypass:** This tool is an assistive data-entry utility. It is not designed, nor should it be used, to bypass multi-factor authentication, access controls, or underlying security protocols.
* **Data Privacy:** This extension processes CAPTCHA images locally. It does not collect, store, transmit, or share ERP credentials, session cookies, or personal login data.

## ⚠️ Known Limitations

* **Recognition Variance:** OCR accuracy is highly dependent on the noise, distortion, and obfuscation techniques used in the source CAPTCHA image. 
* **Structural Dependency:** The extension relies on specific DOM structures (HTML element IDs/Classes). Updates to the ERP portal's UI may require corresponding updates to the extension's content scripts.

## 🤝 Contributing

Contributions, bug reports, and structural improvements are welcome. 

1. Please open an Issue outlining the bug or proposed enhancement. 
2. Provide clear steps to reproduce the issue.
3. **Crucial:** Scrub all screenshots, logs, and descriptions of any personal credentials, session tokens, or sensitive institutional URLs before submitting.

## 📄 License

*License pending.* Please refer to the repository's root directory for future `LICENSE` file updates regarding redistribution and modification terms.

## ✍️ Author

**Apoorva Deep Singh**
* **GitHub:** [@apoorva5ingh](https://github.com/apoorva5ingh)
* **LinkedIn:** [Apoorva Singh](https://linkedin.com/in/apoorvasingh24)
