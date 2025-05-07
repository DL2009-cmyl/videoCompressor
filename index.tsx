import { Plugin } from "@utils/types";
import { findByProps } from "@webpack";
import { React } from "@webpack/common";
import Logger from "./Logger"; 


interface UploadModuleOptions {
    file: File;
    channelId: string;
    showsAttachmentOptions?: boolean;
}

console.log("[VideoComp] Plugin initializing...");

export default {
    name: "VideoComp",
    description: "Adds a button to compress and upload videos under 10MB",
    authors: [{ name: "diego.ffm320"}],
    observer: null as MutationObserver | null,
    intervalId: null as NodeJS.Timeout | null,
    buttonInjected: false,
    debugMode: true,
    lastChannelId: null as string | null, // Add this to track the last active channel

    log(...args: any[]) {
        if (this.debugMode) {
            console.log(`[${this.name}]`, ...args);
        }
    },
    // Plugin lifecycle methods
    start() {
        Logger.log("Starting plugin...");
        this.tryInjectButton();

        this.intervalId = setInterval(() => {
            // Check if channel changed
            const currentChannelId = this.getCurrentChannelId();
            if (currentChannelId !== this.lastChannelId) {
                this.log(`Channel changed: ${this.lastChannelId} -> ${currentChannelId}`);
                this.lastChannelId = currentChannelId;
                this.buttonInjected = false; // Reset the flag when channel changes
            }
            
            if (!this.buttonInjected) {
                this.tryInjectButton();
            }
        }, 1000);

        this.observer = new MutationObserver((mutations) => {
            // Only try to inject if we detect relevant UI changes (not on every mutation)
            for (const mutation of mutations) {
                if (mutation.target && 
                   (mutation.target.className?.includes?.('buttons__74017') ||
                    mutation.target.className?.includes?.('buttons') || 
                    mutation.target.className?.includes?.('toolbar') || 
                    mutation.target.className?.includes?.('attach'))) {
                    
                    // Check if button is still present
                    if (!document.getElementById("video-comp-btn")) {
                        this.buttonInjected = false;
                    }
                    
                    if (!this.buttonInjected) {
                        this.tryInjectButton();
                        break;
                    }
                }
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"]
        });
    },

    findButtonContainer(): Element | null {
        // Try to find the standard Discord attachment button container
        const container = document.querySelector('[class^="buttons_"]') || 
                         document.querySelector('[class*=" buttons_"]') ||
                         document.querySelector('.buttons-3JBrkn') || // Common Discord class
                         document.querySelector('.attachButton-3JtTw3'); // Another common class
        
        if (container) {
            this.log("Found button container:", container);
            return container;
        }
        
        // Fallback: Look for elements that contain attachment buttons
        const attachmentButtons = document.querySelectorAll('button[aria-label="Attach file"]');
        if (attachmentButtons.length > 0) {
            // Find the parent that contains these buttons
            for (const btn of attachmentButtons) {
                const parent = btn.closest('div');
                if (parent) {
                    this.log("Found container via attachment button:", parent);
                    return parent;
                }
            }
        }
        
        this.log("Could not find button container");
        return null;
    },

    tryInjectButton() {
        if (this.buttonInjected) return;

        const container = this.findButtonContainer();
        if (container) {
            // Check if button already exists before injecting
            if (!document.getElementById("video-comp-btn")) {
                this.injectButton(container);
            } else {
                this.buttonInjected = true;
                this.log("Button already exists, setting flag");
            }
        } else {
            this.log("No suitable container found.");
        }
    },

    injectButton(container: Element) {
        if (document.getElementById("video-comp-btn")) {
            this.buttonInjected = true;
            return;
        }
    
        this.log("Injecting button into:", container);
        this.lastChannelId = this.getCurrentChannelId(); // Store channel ID when injecting
    
        const btn = document.createElement("div");
        btn.id = "video-comp-btn";
        btn.style.display = "flex";
        btn.style.alignItems = "center";
    
        try {
            // Improved React render method detection with fallbacks
            let renderMethod = null;
            
            // Try to find React render methods through multiple approaches
            const reactDOM = findByProps("render", "createRoot", "hydrate") || 
                             findByProps("render", "hydrate") ||
                             window.BdApi?.React?.DOM;
            
            // Use direct React DOM access if available in global scope
            // This is useful in environments where webpack modules might be structured differently
            const globalReactDOM = window.ReactDOM || window._?._reactDom || window.__REACT_DOM__;
            
            if (reactDOM?.createRoot) {
                this.log("Using React 18 createRoot");
                renderMethod = (component: React.ReactElement, container: Element) => {
                    reactDOM.createRoot(container).render(component);
                };
            } else if (reactDOM?.render) {
                this.log("Using React render");
                renderMethod = (component: React.ReactElement, container: Element) => {
                    reactDOM.render(component, container);
                };
            } else if (globalReactDOM?.render) {
                this.log("Using global ReactDOM");
                renderMethod = (component: React.ReactElement, container: Element) => {
                    globalReactDOM.render(component, container);
                };
            } else if (window.BdApi?.React?.createElement && window.BdApi?.ReactDOM?.render) {
                // BetterDiscord specific fallback
                this.log("Using BdApi render methods");
                renderMethod = (component: React.ReactElement, container: Element) => {
                    window.BdApi.ReactDOM.render(component, container);
                };
            } else {
                // Last resort: try to render using basic DOM operations
                this.log("No React render methods found, using DOM fallback");
                const ButtonComponent = this.createCompressButtonComponent();
                const instance = new ButtonComponent({});
                
                if (typeof instance.render === 'function') {
                    // Create a button manually
                    const manualBtn = document.createElement('button');
                    manualBtn.textContent = "🎥";
                    manualBtn.title = "Compress & upload video";
                    manualBtn.style.background = "none";
                    manualBtn.style.border = "none";
                    manualBtn.style.color = "var(--interactive-normal)";
                    manualBtn.style.padding = "8px";
                    manualBtn.style.margin = "0 2px";
                    manualBtn.style.borderRadius = "4px";
                    manualBtn.style.cursor = "pointer";
                    manualBtn.style.fontSize = "20px";
                    manualBtn.style.height = "44px";
                    manualBtn.style.width = "44px";
                    
                    manualBtn.addEventListener('click', instance.handleClick);
                    btn.appendChild(manualBtn);
                    container.prepend(btn);
                    this.buttonInjected = true;
                    this.log("Button injected using DOM fallback");
                    return;
                }
                
                throw new Error("Could not find any viable render method");
            }
    
            const ButtonComponent = this.createCompressButtonComponent();
            renderMethod(
                React.createElement(ButtonComponent),
                btn
            );
    
            container.prepend(btn);
            this.buttonInjected = true;
            this.log("Button injected successfully.");
        } catch (error) {
            console.error("[VideoComp] Failed to inject button:", error);
        }
    },

    removeButton() {
        const btn = document.getElementById("video-comp-btn");
        if (btn) {
            try {
                const { unmountComponentAtNode } = findByProps("unmountComponentAtNode") || {};
                if (unmountComponentAtNode) {
                    unmountComponentAtNode(btn);
                }
                btn.remove();
                this.log("Button removed.");
            } catch (error) {
                console.error("[VideoComp] Error removing button:", error);
                btn.remove();
            }
        }
    },

    getCurrentChannelId(): string | null {
        // Method 1: From URL - this is the most reliable method
        const urlMatch = window.location.href.match(/channels\/\d+\/(\d+)/);
        if (urlMatch?.[1]) {
            this.log(`Found channel ID from URL: ${urlMatch[1]}`);
            return urlMatch[1];
        }
        
        // Fallback: Try from Discord's store only if URL method fails
        try {
            const channelStore = findByProps("getChannelId", "getLastSelectedChannelId");
            if (channelStore && typeof channelStore.getChannelId === "function") {
                const channelId = channelStore.getChannelId();
                if (channelId) {
                    this.log(`Found channel ID from store: ${channelId}`);
                    return channelId;
                }
            }
        } catch (err) {
            this.log("Error getting channel from store:", err);
        }

        this.log("Could not determine channel ID");
        return null;
    },

    // Main component
    createCompressButtonComponent() {
        const plugin = this;

        return class CompressButton extends React.Component {
            state = {
                isCompressing: false,
                uploadProgress: 0,
                currentMethod: "",
                error: ""
            };

            // Compression with proper error handling
            compressVideo(file: File): Promise<File> {
                return new Promise((resolve, reject) => {
                    const video = document.createElement("video");
                    video.src = URL.createObjectURL(file);
                    video.muted = true;
                    video.playsInline = true;
            
                    // Error handlers
                    video.onerror = () => {
                        reject(new Error("Failed to load video file"));
                        URL.revokeObjectURL(video.src);
                    };
            
                    video.onloadedmetadata = () => {
                        // Calculate dimensions - more aggressive downscaling for speed
                        const targetWidth = 1920;  // 480p width
                        const targetHeight = 720; // 480p height
                        let width = video.videoWidth;
                        let height = video.videoHeight;
            
                        // Maintain aspect ratio
                        const ratio = Math.min(targetWidth / width, targetHeight / height);
                        width = Math.floor(width * ratio);
                        height = Math.floor(height * ratio);
            
                        plugin.log(`Original: ${video.videoWidth}x${video.videoHeight}, Compressed: ${width}x${height}`);
            
                        // Set up canvas
                        const canvas = document.createElement("canvas");
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext("2d", { alpha: false }); // alpha: false for speed
                        if (!ctx) {
                            reject(new Error("Could not get canvas context"));
                            return;
                        }
                        
                        // Try different codecs and find what's supported
                        let mimeType = "";
                        const codecs = [
                            "video/webm;codecs=vp9", // Prefer VP9 for better quality/size ratio
                            "video/webm;codecs=vp8",
                            "video/webm",
                            "video/mp4"
                        ];
                        
                        for (const codec of codecs) {
                            if (MediaRecorder.isTypeSupported(codec)) {
                                mimeType = codec;
                                break;
                            }
                        }
                        
                        if (!mimeType) {
                            reject(new Error("No supported video codec found in this browser"));
                            return;
                        }
            
                        plugin.log(`Using codec: ${mimeType}`);
            
                        // Calculate optimal bitrate based on resolution - lower bitrate = faster encoding
                        const pixelCount = width * height;
                        const videoBitsPerSecond = Math.min(
                            // Base bitrate on resolution - lower resolution = lower bitrate needed
                            Math.max(500000, Math.floor(pixelCount * 0.2)),
                            1500000 // Cap at 1.5 Mbps for Discord optimization
                        );
                        
                        plugin.log(`Using bitrate: ${videoBitsPerSecond/1000}kbps`);
            
                        // Optimize playback rate for faster processing - speeds up compression
                        const playbackRate = 1.5; // Process video faster
                        video.playbackRate = playbackRate;
                        
                        // Lower framerate for faster processing
                        const fps = 25; // Down from 30
                        
                        // Set up MediaRecorder with optimized settings
                        const stream = canvas.captureStream(fps);
                        const recorder = new MediaRecorder(stream, {
                            mimeType,
                            videoBitsPerSecond // Reduced bitrate
                        });
            
                        const chunks: Blob[] = [];
                        recorder.ondataavailable = (e) => {
                            if (e.data.size > 0) {
                                chunks.push(e.data);
                            }
                        };
            
                        recorder.onstop = () => {
                            if (chunks.length === 0) {
                                reject(new Error("No video data was recorded"));
                                return;
                            }
            
                            const fileType = mimeType.startsWith("video/webm") ? "webm" : "mp4";
                            const blob = new Blob(chunks, { type: mimeType });
                            if (blob.size === 0) {
                                reject(new Error("Compressed video is 0 bytes"));
                                return;
                            }
            
                            resolve(new File(
                                [blob],
                                `compressed_${file.name.replace(/\.[^/.]+$/, "")}.${fileType}`,
                                { type: mimeType }
                            ));
                            URL.revokeObjectURL(video.src);
                        };
            
                        recorder.onerror = (e) => {
                            reject(new Error(`MediaRecorder error: ${e}`));
                        };
            
                        // Use larger chunks for fewer processing operations
                        recorder.start(500); // Collect data every 500ms instead of 100ms
            
                        // Optimize frame drawing for speed
                        let frameCount = 0;
                        const frameSkip = 1; // Process every other frame
                        let animationFrameId: number;
                        
                        const drawFrame = () => {
                            try {
                                if (video.paused || video.ended) {
                                    cancelAnimationFrame(animationFrameId);
                                    recorder.stop();
                                    return;
                                }
                                
                                // Skip frames for faster processing
                                frameCount++;
                                if (frameCount % frameSkip === 0) {
                                    ctx.drawImage(video, 0, 0, width, height);
                                }
                                
                                animationFrameId = requestAnimationFrame(drawFrame);
                            } catch (err) {
                                cancelAnimationFrame(animationFrameId);
                                reject(new Error(`Error drawing video frame: ${err}`));
                            }
                        };
            
                        // Start playback
                        video.play().catch(err => {
                            reject(new Error(`Video play failed: ${err}`));
                        });
            
                        drawFrame();
            
                        // Stop conditions
                        video.onended = () => {
                            cancelAnimationFrame(animationFrameId);
                            try {
                                if (recorder.state === "recording") {
                                    recorder.stop();
                                }
                            } catch (e) {
                                plugin.log("Error stopping recorder:", e);
                            }
                        };
            
                        // Adaptive safety timeout
                        const safetyTimeout = Math.min(
                            Math.max((video.duration / playbackRate) * 1000 * 1.2, 30000), // 1.2x adjusted playback time
                            180000 // Max 3 minutes
                        );
                        
                        setTimeout(() => {
                            if (recorder.state === "recording") {
                                cancelAnimationFrame(animationFrameId);
                                try {
                                    recorder.stop();
                                } catch (e) {
                                    plugin.log("Error stopping recorder:", e);
                                }
                            }
                        }, safetyTimeout);
                    };
                });
            }

            // Get Discord token safely - optimized to focus on what works
            getDiscordToken(): string | null {
                try {
                    // Access localStorage directly - this works as shown by your logs
                    if (window.localStorage) {
                        const token = window.localStorage.getItem('token');
                        if (token) {
                            return token.replace(/"/g, '');
                        }
                    }
                    
                    // Backup methods
                    try {
                        const tokenModule = findByProps('getToken');
                        if (tokenModule && tokenModule.getToken && typeof tokenModule.getToken === 'function') {
                            const token = tokenModule.getToken();
                            if (token) return token;
                        }
                    } catch (e) {
                        plugin.log("Error getting token from modules:", e);
                    }

                    // Check for token in meta tag - less common but can work
                    const metaToken = document.querySelector('meta[name="token"]');
                    if (metaToken) {
                        const token = metaToken.getAttribute('content');
                        if (token) return token;
                    }
                } catch (e) {
                    plugin.log("Error getting Discord token:", e);
                }
                
                return null;
            }

            // Upload method - Direct XHR upload only (since this was the only successful method)
            async uploadToDiscord(file: File) {
                const channelId = plugin.getCurrentChannelId();
                if (!channelId) throw new Error("Couldn't determine channel ID");

                plugin.log(`Attempting to upload to channel: ${channelId}`);
                
                this.setState({ currentMethod: "Uploading..." });
                return this.tryDirectUpload(file, channelId);
            }

            async tryDirectUpload(file: File, channelId: string): Promise<void> {
                return new Promise((resolve, reject) => {
                    const token = this.getDiscordToken();
                    
                    if (!token) {
                        return reject(new Error("No authentication token found"));
                    }

                    plugin.log("Got token, attempting direct upload");

                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('content', ''); // Empty message content
                    
                    // For proper Discord upload handling
                    const filename = file.name;
                    const fileType = file.type;
                    
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', `https://discord.com/api/v9/channels/${channelId}/messages`);
                    xhr.setRequestHeader('Authorization', token);
                    
                    // Optional: Add user agent to mimic Discord client
                    xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                    
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            plugin.log("Upload successful with status:", xhr.status);
                            resolve();
                        } else {
                            plugin.log("Upload failed with status:", xhr.status, xhr.responseText);
                            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
                        }
                    };

                    xhr.onerror = () => {
                        plugin.log("XHR error during upload");
                        reject(new Error("Network error during upload"));
                    };
                    
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.round((e.loaded / e.total) * 100);
                            this.setState({ 
                                uploadProgress: percent,
                                currentMethod: `Uploading: ${percent}%`
                            });
                        }
                    };

                    xhr.send(formData);
                });
            }

            // Main click handler - simplified for clarity
            handleClick = async () => {
                if (this.state.isCompressing) return;

                this.setState({ 
                    isCompressing: true,
                    uploadProgress: 0,
                    currentMethod: "",
                    error: ""
                });

                try {
                    // File selection
                    const file = await new Promise<File | null>((resolve) => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "video/*";
                        input.onchange = () => resolve(input.files?.[0] || null);
                        input.click();
                    });

                    if (!file) {
                        this.setState({ isCompressing: false });
                        return;
                    }

                    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
                    plugin.log(`Selected file: ${file.name} (${fileSizeMB}MB)`);
                    
                    // Check size limit
                    const maxSize = 10 * 1024 * 1024; // 10MB
                    
                    // Compression if needed
                    let fileToUpload = file;
                    if (file.size > maxSize) {
                        this.setState({ currentMethod: "Compressing video..." });
                        try {
                            const compressed = await this.compressVideo(file);
                            const compressedSizeMB = (compressed.size / 1024 / 1024).toFixed(2);
                            plugin.log(`Compressed to: ${compressedSizeMB}MB`);
                            
                            if (compressed.size > maxSize) {
                                throw new Error(`Couldn't compress below 10MB (${compressedSizeMB}MB)`);
                            }
                            
                            fileToUpload = compressed;
                        } catch (err) {
                            throw new Error(`Compression failed: ${err instanceof Error ? err.message : String(err)}`);
                        }
                    }

                    // Upload
                    await this.uploadToDiscord(fileToUpload);
                    plugin.log("Upload completed successfully");
                    this.setState({ currentMethod: "Upload successful!" });
                    
                    // Clear the success message after 3 seconds
                    setTimeout(() => {
                        this.setState({ currentMethod: "" });
                    }, 3000);

                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    console.error("[VideoComp] Error:", errorMsg);
                    this.setState({ error: errorMsg });
                } finally {
                    this.setState({ isCompressing: false });
                }
            };

            render() {
                const { isCompressing, currentMethod, error } = this.state;

                // Improved UI with better status visibility
                return React.createElement(
                    "div",
                    { style: { position: "relative", display: "inline-block" } },
                    React.createElement(
                        "button",
                        {
                            onClick: this.handleClick,
                            disabled: isCompressing,
                            title: isCompressing ? "Processing video..." : "Compress & upload video",
                            style: {
                                background: "none",
                                border: "none",
                                color: isCompressing ? "var(--text-muted)" : "var(--interactive-normal)",
                                padding: "8px",
                                margin: "0 2px",
                                borderRadius: "4px",
                                cursor: isCompressing ? "wait" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "20px",
                                height: "44px",
                                width: "44px",
                                transition: "all 0.2s ease"
                            },
                            onMouseEnter: (e: any) => {
                                if (!isCompressing) {
                                    e.currentTarget.style.color = "var(--interactive-hover)";
                                    e.currentTarget.style.background = "var(--background-modifier-hover)";
                                }
                            },
                            onMouseLeave: (e: any) => {
                                e.currentTarget.style.color = isCompressing
                                    ? "var(--text-muted)"
                                    : "var(--interactive-normal)";
                                e.currentTarget.style.background = "none";
                            }
                        },
                        // Use different emoji for different states
                        isCompressing ? 
                            (currentMethod?.includes("Compressing") ? "🔄" : 
                             currentMethod?.includes("Upload") ? "📤" : "⏳") 
                            : "🎥"
                    ),
                    
                    // Status tooltip
                    currentMethod && React.createElement(
                        "div",
                        {
                            style: {
                                position: "absolute",
                                bottom: "100%",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "var(--background-floating)",
                                color: currentMethod.includes("successful") ? "var(--text-positive)" : "var(--text-normal)",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                whiteSpace: "nowrap",
                                zIndex: 1000,
                                marginBottom: "4px",
                                boxShadow: "0 2px 10px 0 rgba(0,0,0,0.2)"
                            }
                        },
                        currentMethod
                    ),
                    
                    // Error message
                    error && React.createElement(
                        "div",
                        {
                            style: {
                                position: "absolute",
                                top: "100%",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "var(--background-floating)",
                                color: "var(--text-danger)",
                                padding: "6px 10px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                zIndex: 1000,
                                marginTop: "4px",
                                border: "1px solid var(--status-danger)",
                                maxWidth: "250px",
                                boxShadow: "0 2px 10px 0 rgba(0,0,0,0.2)",
                                textAlign: "center",
                                wordBreak: "break-word"
                            }
                        },
                        error
                    )
                );
            }
        };
    }
} satisfies Plugin;