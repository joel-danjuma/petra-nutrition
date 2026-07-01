### **Product Requirements Document: Petra (V1.0)**

**Document Control**
*   **Product Name:** Petra
*   **Version:** 1.0
*   **Status:** Final
*   **Date:** September 7, 2025
*   **Author:** JAD.BIILD
*   **Description:** Unified PRD for the Petra AI kitchen assistant, detailing a three-service monorepo architecture (backend, web, mobile) and a self-hosted deployment strategy on a Google Cloud VM with Docker.

---

**1. Introduction**
This document outlines the product requirements for V1.0 of Petra, an AI-powered nutrition and kitchen management application. Petra will be delivered to users via two frontends (a web application and a native mobile application) powered by a single, unified backend. The application provides users with an intelligent chat agent to discover recipes, create meal plans, and manage their home pantry, all linked to a secure personal account.

**2. Vision & Goals**
*   **Vision:** To empower users to make healthier, more convenient, and less wasteful food choices by providing an intelligent, personalized, and universally accessible platform for recipe discovery, meal planning, and kitchen management.
*   **Business Goals:**
    *   Maximize user reach by offering both web and mobile platforms from V1.
    *   Drive revenue by converting engaged users to a premium subscription that offers advanced management tools.
    *   Establish Petra as an indispensable tool for home cooks and health-conscious individuals.
*   **User Goals:**
    *   To access their meal plans and recipes from any device, whether a browser or a downloaded app.
    *   To reduce food waste and save money by effectively managing their pantry.
    *   To simplify the complex process of weekly meal planning and grocery shopping.

**3. User Personas**
*   **The Busy Professional:** Accesses Petra on their work computer (web) to plan the week, then uses the mobile app in the kitchen for recipes and in the store with the shopping list.
*   **The Health-Conscious Individual:** Prefers the mobile app for its seamless camera integration for logging pantry items and tracking meals.
*   **The Family Meal Planner:** Uses the larger screen of a tablet or computer (web) for the complex task of planning a week's worth of family meals.

**4. Features & Functionality (V1.0)**

**4.1. AI Chat Agent (Core/Free)**
*   **Description:** A conversational interface serving as the primary method of user interaction with Petra.
*   **Platform Implementation Notes:** The chat UI will be implemented natively on both web and mobile platforms, connecting to the same backend AI service.

**4.2. Recipe Generation & Search (Core/Free)**
*   **Description:** The ability to generate, search for, and display recipes based on user queries or pantry items.
*   **Platform Implementation Notes:** Recipe display will be optimized for both web (multi-column layouts on large screens) and mobile (scrollable, single-column views).

**4.3. User Profile (Core/Free)**
*   **Description:** A section for users to input personal data (health stats, allergies, dietary needs) for customization, linked to their account.

**4.4. Meal Planning (Freemium)**
*   **Description:** Generation of structured meal plans. Free users can generate single-day plans; premium users can generate multi-day plans.

**4.5. Pantry & Inventory Management (Premium)**
*   **Description:** A digital inventory of the user's pantry and fridge.
*   **Platform Implementation Notes:**
    *   **Unified:** The core logic for adding/removing items will connect to the same backend API endpoints.
    *   **Mobile (React Native):** The UI will feature a prominent button to open the device camera. Barcode scanning will be handled by the `expo-barcode-scanner` library for a fast, native experience. Image recognition for fresh foods will use `expo-camera`. This is the primary, recommended user experience.
    *   **Web (Next.js):** The UI will feature an "Add from Barcode/Image" button. This will trigger the browser's MediaDevices API to request camera access. A message will inform the user that this experience is best on the mobile app and performance may vary by browser.

**4.6. Automated Shopping List (Premium)**
*   **Description:** A smart shopping list generated from a meal plan that automatically cross-references the user's logged pantry inventory.

**4.7. Authentication & User Accounts (Core/Free)**
*   **Description:** A foundational feature for the creation and management of user accounts.
*   **Platform Implementation Notes:**
    *   **Unified:** The same backend endpoints will handle user registration and login for both platforms.
    *   **Web:** Session management will be handled using secure, HTTP-only cookies containing JWTs.
    *   **Mobile:** Session management will be handled by storing the JWT securely on the device using the native Keychain (iOS) and Keystore (Android), accessible via a React Native library.

**5. Technical Architecture & Stack**

*   **Project Structure:** The project will be structured as a **monorepo** containing three separate applications and a shared logic package.
*   **`Backend Service`**
    *   **Language/Framework:** TypeScript, Express.js
    *   **Database:** PostgreSQL
    *   **Data Validation (AI):** Pydantic
*   **`Web Frontend`**
    *   **Framework:** Next.js
    *   **Language/Library:** TypeScript, React
    *   **UI Components:** shadcn/ui
*   **`Mobile Frontend`**
    *   **Framework:** React Native with Expo
    *   **Navigation:** React Navigation
    *   **Device Hardware:** `expo-camera`, `expo-barcode-scanner`
*   **`Shared Logic Package`**
    *   **Purpose:** To contain code shared between the web and mobile frontends, including the API client, state management logic (Zustand/Redux), TypeScript types, and non-UI custom hooks.
*   **`AI Model Strategy`**
    *   **Core Chat:** Llama 3 8B (latest) via GroqAPI.
    *   **Complex Generation:** Llama 3 70B (latest) via GroqAPI.
    *   **Image Recognition:** Gemini Pro Vision API (or latest equivalent).

**6. V1 Deployment Strategy**

*   **Primary Infrastructure:** A **Google Cloud Compute Engine VM** will serve as the host for the core application services.
*   **Containerization:** **Docker** and **Docker Compose** will be used to containerize and manage the application services for consistency and isolation.
*   **Services Hosted on VM:**
    1.  **Backend Service:** Runs in a Node.js container.
    2.  **Web Frontend Service:** Runs in a Node.js container serving the Next.js application.
    3.  **PostgreSQL Database:** Runs in the official Postgres container with a persistent volume for data.
    4.  **Nginx Reverse Proxy:** Runs in an Nginx container, acting as the single entry point for all web traffic. It will handle routing requests to the appropriate service (e.g., `petra.com` -> Web, `api.petra.com` -> Backend) and manage SSL termination.
*   **Mobile App Deployment:**
    *   The mobile application is **not hosted** on the VM.
    *   It will be built and submitted to the Apple App Store and Google Play Store using **Expo Application Services (EAS)**.

**7. Non-Functional Requirements**
*   **Performance:** AI responses should have minimal latency. Web pages and mobile screens must load quickly.
*   **Security:** All user data, especially PII and health information, must be encrypted at rest and in transit. Secure authentication practices are mandatory.
*   **Usability:** Both the web and mobile interfaces must be clean, accessible (WCAG compliant), and intuitive.

**8. Success Metrics**
*   **User Engagement:** Daily/Monthly Active Users (DAU/MAU) segmented by platform (web vs. mobile).
*   **Feature Adoption:** Usage rate of premium features, especially camera-based pantry logging on mobile.
*   **Conversion Rate:** Percentage of free users upgrading to the premium tier.
*   **Retention:** Monthly cohort retention rates for each platform.