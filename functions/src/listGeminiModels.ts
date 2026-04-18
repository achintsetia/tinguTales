import {onCall, HttpsError} from "firebase-functions/v2/https";
import {db} from "./admin.js";
import {GoogleGenAI} from "@google/genai";

export const listGeminiModels = onCall(
  {timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userDoc = await db
      .collection("user_profile")
      .doc(request.auth.uid)
      .get();
    if (!userDoc.exists || !userDoc.data()?.is_admin) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError("internal", "GEMINI_API_KEY is not configured.");
    }

    const ai = new GoogleGenAI({apiKey});

    const models: {name: string; displayName: string; description: string}[] =
      [];

    const pager = await ai.models.list();
    for await (const model of pager) {
      const rawName: string = (model.name as string) ?? "";
      // Strip "models/" prefix returned by the API
      const name = rawName.startsWith("models/") ? rawName.slice(7) : rawName;
      if (name.toLowerCase().includes("gemini")) {
        models.push({
          name,
          displayName: (model.displayName as string) ?? name,
          description: (model.description as string) ?? "",
        });
      }
    }

    models.sort((a, b) => a.name.localeCompare(b.name));
    return {models};
  }
);
