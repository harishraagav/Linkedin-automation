// publish.js

/**
 * Executes a fetch request routed through the user's deployed CORS proxy.
 * This is necessary to bypass LinkedIn's strict client-side CORS policy.
 * @param {string} proxyUrl The base URL of the user's deployed worker (e.g., https://publisher.workers.dev).
 * @param {string} endpoint The LinkedIn API path (e.g., /posts or /assets?action=registerUpload), 
 * or the full external upload URL for PUT requests.
 * @param {string} method The HTTP method (POST, PUT).
 * @param {string} accessToken The user's LinkedIn access token.
 * @param {object|Blob} body The request body (JSON object or Blob for image upload).
 * @param {boolean} isBinary Set true if the body is a Blob/binary data (for image PUT).
 * @returns {Promise<Response>} The raw fetch response object.
 */
async function linkedinFetch(proxyUrl, endpoint, method, accessToken, body = null, isBinary = false) {
    // Note: The endpoint here can be a full external DMS URL for image upload!
    // The proxy worker must be configured to handle the full external host for image PUT requests.
    // We send the full URL in a query parameter for the proxy to read and forward.
    const fullUrl = endpoint.startsWith('https://') ? `${proxyUrl}?url=${encodeURIComponent(endpoint)}` : `${proxyUrl}${endpoint}`;
    
    // Default headers required by LinkedIn API
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202409', // Using the latest compatible version
    };

    // Set Content-Type based on request type
    if (isBinary) {
        // For PUT (uploading the image Blob), use octet-stream
        headers['Content-Type'] = 'application/octet-stream';
    } else {
        // For POST (register and create post), use JSON
        headers['Content-Type'] = 'application/json';
        body = body ? JSON.stringify(body) : null;
    }

    const response = await fetch(fullUrl, {
        method: method,
        headers: headers,
        body: body,
    });

    if (!response.ok && response.status !== 201) { // 201 is success for POST
        const errorText = await response.text();
        let errorMessage = `API call failed. Status: ${response.status}.`;
        try {
            const errorData = JSON.parse(errorText);
            // This captures the detail from LinkedIn's error response
            errorMessage += ` Details: ${errorData.message || JSON.stringify(errorData)}`; 
        } catch {
            errorMessage += ` Raw response: ${errorText.substring(0, 100)}`;
        }
        throw new Error(errorMessage);
    }

    return response;
}

/**
 * Registers and uploads a media asset to LinkedIn's servers via the proxy.
 * @param {string} proxyUrl The base URL of the user's deployed worker.
 * @param {string} accessToken The user's LinkedIn access token.
 * @param {string} authorURN The URN of the post's author (e.g., 'urn:li:person:YOUR_ID').
 * @param {Blob} imageBlob The image data as a Blob.
 * @returns {Promise<string>} The URN of the uploaded image (e.g., 'urn:li:digitalmediaAsset:YOUR_ID').
 */
export async function uploadImageToLinkedIn(proxyUrl, accessToken, authorURN, imageBlob) {
    // 1. REGISTER UPLOAD (Uses the main API path: /assets?action=registerUpload)
    const registerPayload = {
        registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: authorURN,
            serviceRelationships: [{
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent"
            }]
        }
    };

    const registerEndpoint = "/assets?action=registerUpload";
    const registerResponse = await linkedinFetch(
        proxyUrl, 
        registerEndpoint, 
        'POST', 
        accessToken, 
        registerPayload
    );

    const registerData = await registerResponse.json();
    // This is the full external URL returned by LinkedIn: https://www.linkedin.com/dms-uploads/...
    const uploadUrl = registerData.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
    const imageURN = registerData.value.asset;

    // 2. UPLOAD THE IMAGE DATA (PUT request to the full external DMS URL)
    const uploadResponse = await linkedinFetch(
        proxyUrl, 
        uploadUrl, // Pass the FULL external URL here
        'PUT', 
        accessToken, 
        imageBlob, 
        true // isBinary=true
    );

    // PUT returns 200/201 on success with an empty body.
    console.log(`Image registered and uploaded successfully. URN: ${imageURN}`);
    return imageURN;
}

/**
 * Creates and publishes a post to LinkedIn via the proxy using the working UGCPosts structure.
 * @param {string} proxyUrl The base URL of the user's deployed worker.
 * @param {string} accessToken The user's LinkedIn access token.
 * @param {string} authorURN The URN of the post's author.
 * @param {string} postText The text content of the post.
 * @param {string|null} imageURN The URN of the uploaded image, or null for text-only.
 * @returns {Promise<object>} Post URN and success message.
 */
export async function createLinkedInPost(proxyUrl, accessToken, authorURN, postText, imageURN = null) {
    // CRITICAL: Use the /ugcPosts endpoint and the successful structure found in the Laravel code
    const endpoint = "/ugcPosts"; 
    
    // Build the media array ONLY if an image URN is present
    const mediaArray = imageURN ? [{
        status: "READY",
        media: imageURN // The urn:li:digitalmediaAsset:ID
    }] : [];

    // Build the shareContent object based on the Laravel structure
    const shareContent = {
        shareCommentary: {
            text: postText
        },
        // Use shareMediaCategory based on whether an image is present
        shareMediaCategory: imageURN ? "IMAGE" : "NONE",
        
        // Only include media array if it's an image post
        ...(imageURN && { media: mediaArray }) 
    };
    
    // Final payload required for the /ugcPosts endpoint
    const postPayload = {
        author: authorURN,
        lifecycleState: "PUBLISHED",
        specificContent: {
            "com.linkedin.ugc.ShareContent": shareContent
        },
        visibility: {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    };

    const postResponse = await linkedinFetch(
        proxyUrl, 
        endpoint, 
        'POST', 
        accessToken, 
        postPayload
    );

    // Successful post creation returns 201 Created and an empty body.
    const postUrn = postResponse.headers.get('Location') || 'N/A';

    return { 
        postUrn: postUrn,
        success: true,
        message: "Post published successfully."
    };
}
