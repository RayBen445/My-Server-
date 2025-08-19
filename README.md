
# Cool Shot Systems API for Vercel

This project contains a Node.js backend (as a Vercel Serverless Function) and a React frontend to create and serve a real API powered by the Google Gemini models.

This project is now correctly configured for one-click deployment on Vercel.

---

### **CRITICAL: Before You Deploy**

You **MUST DELETE** the old `frontend` and `backend` directories from your project repository if they still exist. They are causing the deployment errors on Vercel.

Your final project structure should look like this:

```
/
├── api/
│   └── index.js        (Your serverless backend)
├── index.html          (Your frontend)
├── index.tsx           (Your frontend logic)
├── index.css           (Your frontend styles)
├── package.json        (Your dependencies)
├── vercel.json         (Your Vercel configuration)
└── README.md
```

---

### Deployment on Vercel

1.  **Clean up your repository:** Make sure you have deleted the `frontend` and `backend` folders.
2.  **Fork this repository.**
3.  **Go to [Vercel](https://vercel.com/new).**
4.  **Import your forked repository.**
5.  **Configure Environment Variables:**
    *   Vercel will automatically detect this is a Node.js project.
    *   You need to add your Google Gemini API Key as an environment variable.
        *   **Name:** `API_KEY`
        *   **Value:** `your_real_google_api_key_goes_here`
6.  **Deploy!**

Vercel will now handle the rest correctly. It will serve the frontend from the root directory and deploy the backend from the `api` directory as a serverless function. The `404 NOT_FOUND` error will be resolved.

---

### How It Works (Vercel Version)

*   **Frontend:** The React application files (`index.html`, `index.tsx`, etc.) in the root directory are served as a static site. It makes API calls to relative paths (e.g., `/v1/cool-shot/generate-image`).
*   **Backend:** The code in `/api/index.js` is deployed as a Vercel Serverless Function. It's an Express server that handles all incoming API requests.
*   **Routing:** Vercel's configuration (`vercel.json`) rewrites all requests from `/v1/cool-shot/*` to the serverless function, which then processes them. This keeps your `API_KEY` secure on the server-side.
