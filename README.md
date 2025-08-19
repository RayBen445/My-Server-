
# Cool Shot Systems API for Vercel

This project contains a Node.js backend (as a Vercel Serverless Function) and a React frontend to create and serve a real API powered by the Google Gemini models.

This project is configured for one-click deployment on Vercel.

**IMPORTANT:** Before deploying, you MUST delete the old `frontend` and `backend` directories from your project if they exist.

---

### Deployment on Vercel

1.  **Fork this repository.**
2.  **Go to [Vercel](https://vercel.com/new).**
3.  **Import your forked repository.**
4.  **Configure Environment Variables:**
    *   Vercel will automatically detect this is a Node.js project.
    *   You need to add your Google Gemini API Key as an environment variable.
        *   **Name:** `API_KEY`
        *   **Value:** `your_real_google_api_key_goes_here`
5.  **Deploy!**

Vercel will handle the rest. It will serve the frontend from the root directory and deploy the backend from the `api` directory as a serverless function.

---

### How It Works

*   **Frontend:** The React application in the root directory is served as a static site. It makes API calls to relative paths (e.g., `/v1/cool-shot/generate-image`).
*   **Backend:** The code in the `/api` directory is deployed as a Vercel Serverless Function. It's an Express server that handles all incoming API requests.
*   **Routing:** Vercel's configuration (`vercel.json`) rewrites all requests from `/v1/cool-shot/*` to the serverless function, which then processes them. This keeps your `API_KEY` secure on the server-side.

---

### Local Development

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Set up your API Key:**
    *   Create a file named `.env` in the root directory.
    *   Add your Google Gemini API Key to it:
        ```
        API_KEY=your_real_google_api_key_goes_here
        ```
3.  **Run the Vercel CLI:**
    *   Install the Vercel CLI: `npm i -g vercel`
    *   Run the development server: `vercel dev`

This will start a local server that emulates the Vercel environment, running both your frontend and your serverless function. You can access the app at the URL provided by the CLI (usually `http://localhost:3000`).
