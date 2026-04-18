import * as dotenv from "dotenv";
dotenv.config();

import {setGlobalOptions} from "firebase-functions/v2";
setGlobalOptions({region: "asia-south1", maxInstances: 10});

export {createChildProfile} from "./createChildProfile.js";
export {generateAvatarOnProfileCreate} from "./generateAvatarOnProfileCreate.js";
export {retryAvatarGeneration} from "./retryAvatarGeneration.js";
export {listGeminiModels} from "./listGeminiModels.js";
export {getUserUploads, syncUploadUrls} from "./getUserUploads.js";
export {deleteUserUpload} from "./deleteUserUpload.js";
export {transliterateChildName} from "./transliterateChildName.js";
export {generateStoryDraft} from "./generateStoryDraft.js";
export {approveStoryDraft} from "./approveStoryDraft.js";
export {getAdminCostReport} from "./getAdminCostReport.js";
