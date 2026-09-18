import { FileAttachment } from "../types";

// Safely access environment variables
const getEnvVar = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || "";
  }
  return "";
};

const CLIENT_ID = getEnvVar("GOOGLE_CLIENT_ID");
const API_KEY = getEnvVar("GOOGLE_API_KEY");
const APP_ID = getEnvVar("GOOGLE_APP_ID");
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient: any;
let accessToken: string | null = null;
let pickerInited = false;
let gisInited = false;

export interface DriveServiceConfig {
  onAuthChange: (isInited: boolean) => void;
}

export interface DriveDownloadResult {
  attachments: FileAttachment[];
  failed: { name: string; error: string }[];
}

export const initDriveApi = (config: DriveServiceConfig) => {
  // Defensive check for config
  if (!CLIENT_ID || !API_KEY || !APP_ID) {
    console.warn("Google Drive API configuration missing (CLIENT_ID, API_KEY, or APP_ID). Drive features will be disabled.");
    return;
  }

  const gapi = (window as any).gapi;
  const google = (window as any).google;

  if (!gapi || !google || !google.accounts || !google.accounts.oauth2) return;

  try {
    // Load GAPI Picker
    gapi.load('client:picker', async () => {
      try {
        await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
        pickerInited = true;
        checkInit(config);
      } catch (e) {
        console.error("Failed to load GAPI Drive discovery", e);
      }
    });

    // Init GIS Token Client
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse: any) => {
        accessToken = tokenResponse.access_token;
      },
    });
    gisInited = true;
    checkInit(config);
  } catch (e) {
    console.error("Error initializing Google APIs", e);
  }
};

const checkInit = (config: DriveServiceConfig) => {
  if (pickerInited && gisInited) {
    config.onAuthChange(true);
  }
};

export const requestAccessToken = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (accessToken) {
      resolve(accessToken);
      return;
    }
    
    if (!tokenClient) {
        // Try to re-init if context allows, otherwise fail
        if (CLIENT_ID && (window as any).google?.accounts?.oauth2) {
             try {
                tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: (tokenResponse: any) => {
                        if (tokenResponse.error !== undefined) {
                            reject(tokenResponse);
                        }
                        accessToken = tokenResponse.access_token;
                        resolve(accessToken);
                    },
                });
             } catch (e) {
                 reject(new Error("Failed to initialize token client: " + e));
                 return;
             }
        } else {
             reject(new Error("Google Identity Services not initialized or configuration missing."));
             return;
        }
    }
    
    // Trigger the flow
    try {
        if (tokenClient) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            reject(new Error("Token client could not be initialized"));
        }
    } catch (e) {
        reject(e);
    }
  });
};

export const openPicker = async (): Promise<any[]> => {
  if (!accessToken) {
    try {
        await requestAccessToken();
    } catch (e) {
        console.error("Auth failed", e);
        throw e;
    }
  }

  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google || !google.picker) {
        reject(new Error("Google Picker API not loaded"));
        return;
    }

    try {
        const ViewId = google.picker.ViewId;

        const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setAppId(APP_ID)
        .setOAuthToken(accessToken!)
        .addView(new google.picker.DocsView(ViewId.DOCS))
        .addView(new google.picker.DocsView(ViewId.FOLDERS))
        .setDeveloperKey(API_KEY)
        .setCallback((data: any) => {
            if (data.action === google.picker.Action.PICKED) {
            resolve(data.docs);
            } else if (data.action === google.picker.Action.CANCEL) {
            resolve([]);
            }
        })
        .build();
        picker.setVisible(true);
    } catch (e) {
        reject(e);
    }
  });
};

// Recursive function to get all files from folders
const expandFolders = async (items: any[]): Promise<any[]> => {
  const gapi = (window as any).gapi;
  if (!gapi || !gapi.client || !gapi.client.drive) return items;

  let allFiles: any[] = [];

  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      try {
        const response = await gapi.client.drive.files.list({
          q: `'${item.id}' in parents and trashed = false`,
          fields: 'files(id, name, mimeType)',
          pageSize: 100
        });
        const children = response.result.files;
        const expandedChildren = await expandFolders(children);
        allFiles = [...allFiles, ...expandedChildren];
      } catch (err) {
        console.error("Error expanding folder", item.name, err);
      }
    } else {
      allFiles.push(item);
    }
  }
  return allFiles;
};

export const downloadDriveFiles = async (pickedItems: any[]): Promise<DriveDownloadResult> => {
  const gapi = (window as any).gapi;
  if (!gapi.client.drive) {
    throw new Error("Drive API not loaded");
  }

  const filesToProcess = await expandFolders(pickedItems);
  const attachments: FileAttachment[] = [];
  const failed: { name: string; error: string }[] = [];

  // Allowed types for Gemini processing
  const SUPPORTED_MIME_TYPES = new Set([
    'application/pdf',
    'application/json',
    'application/rtf',
    'application/x-javascript',
    'application/xml',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]);

  for (const file of filesToProcess) {
    try {
      let result: any;
      let finalMimeType = file.mimeType;
      let isGoogleDoc = false;

      // 1. Handle Google Workspace Documents (Export)
      if (file.mimeType === 'application/vnd.google-apps.document') {
        finalMimeType = 'text/plain'; 
        isGoogleDoc = true;
        result = await gapi.client.drive.files.export({
          fileId: file.id,
          mimeType: 'text/plain'
        });
      } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
        finalMimeType = 'text/csv';
        isGoogleDoc = true;
        result = await gapi.client.drive.files.export({
          fileId: file.id,
          mimeType: 'text/csv'
        });
      } else if (file.mimeType === 'application/vnd.google-apps.presentation') {
        finalMimeType = 'text/plain';
        isGoogleDoc = true;
        result = await gapi.client.drive.files.export({
          fileId: file.id,
          mimeType: 'text/plain'
        });
      } 
      
      if (isGoogleDoc) {
          const textContent = result.body;
          // Handle UTF-8 safely for base64
          const base64Content = btoa(unescape(encodeURIComponent(textContent)));

          attachments.push({
            name: file.name + (finalMimeType === 'text/plain' ? '.txt' : '.csv'),
            type: finalMimeType,
            data: base64Content
          });
          continue;
      }

      // 2. Handle Standard Files (Direct Download)
      // Check if file type is supported
      const isText = file.mimeType.startsWith('text/');
      if (!isText && !SUPPORTED_MIME_TYPES.has(file.mimeType)) {
          throw new Error(`Unsupported file type: ${file.mimeType}. Supported types include PDF, Text, CSV, JSON, and Images.`);
      }

      const token = gapi.client.getToken().access_token;
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!resp.ok) {
          throw new Error(`HTTP Error ${resp.status}: ${resp.statusText}`);
      }
      
      const blob = await resp.blob();
      const base64 = await blobToBase64(blob);
      
      attachments.push({
        name: file.name,
        type: file.mimeType,
        data: base64
      });

    } catch (e: any) {
      console.error(`Failed to download/export file ${file.name}`, e);
      failed.push({
        name: file.name,
        error: e.result?.error?.message || e.message || "Unknown error"
      });
    }
  }

  return { attachments, failed };
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); 
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};