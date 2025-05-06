import { Plugin } from "@utils/types";
import { findByProps } from "@webpack";
import { React } from "@webpack/common";

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

    // Plugin lifecycle methods
    start() {
        this.log("Starting plugin...");
        this.tryInjectButton();

        this.intervalId = setInterval(() => {
            if (!this.buttonInjected) {
                this.tryInjectButton();
            }
        }, 1000);

        this.observer = new MutationObserver(() => {
            if (!this.buttonInjected) {
                this.tryInjectButton();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"]
        });
    },

    stop() {
        this.log("Stopping plugin...");
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.removeButton();
        this.buttonInjected = false;
    },

    // Utility methods
    log(...args: any[]) {
        if (this.debugMode) {
            console.log("[VideoComp]", ...args);
        }
    },

    tryInjectButton() {
        if (this.buttonInjected) return;

        const container = this.findButtonContainer();
        if (container) {
            this.injectButton(container);
        } else {
            this.log("No suitable container found.");
        }
    },

    findButtonContainer(): Element | null {
        // Updated selectors to match modern Discord UI
        const selectors = [
            ".buttons__74017", 
            ".buttons-3JBrkn",
            ".toolbar-1t6TWx",
            ".attachWrapper-2TRKBi",
            ".buttons-uaqb-5",
            // More general fallback
            "[class*='buttons-']"
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        
        return null;
    },

    injectButton(container: Element) {
        if (document.getElementById("video-comp-btn")) {
            this.buttonInjected = true;
            return;
        }

        this.log("Injecting button into:", container);

        const btn = document.createElement("div");
        btn.id = "video-comp-btn";
        btn.style.display = "flex";
        btn.style.alignItems = "center";

        try {
            // Try modern React 18 createRoot first, then fallback
            const renderMethods = findByProps("createRoot", "render") || 
                                  findByProps("render", "hydrate") ||
                                  window.BdApi?.React?.DOM;
                                  
            if (!renderMethods) {
                console.error("[VideoComp] Could not find React render methods");
                return;
            }

            const ButtonComponent = this.createCompressButtonComponent();
            
            if (renderMethods.createRoot) {
                renderMethods.createRoot(btn).render(React.createElement(ButtonComponent));
            } else if (renderMethods.render) {
                renderMethods.render(React.createElement(ButtonComponent), btn);
            } else {
                console.error("[VideoComp] Couldn't find a way to render the component");
                return;
            }

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
                        // Calculate dimensions while maintaining aspect ratio
                        const maxWidth = 1280;
                        const maxHeight = 720;
                        let width = video.videoWidth;
                        let height = video.videoHeight;

                        if (width > maxWidth || height > maxHeight) {
                            const ratio = Math.min(maxWidth / width, maxHeight / height);
                            width = Math.floor(width * ratio);
                            height = Math.floor(height * ratio);
                        }

                        // Set up canvas
                        const canvas = document.createElement("canvas");
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) {
                            reject(new Error("Could not get canvas context"));
                            return;
                        }

                        // Try different codecs and find what's supported
                        let mimeType = "";
                        const codecs = [
                            "video/webm;codecs=vp9",
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

                        // Set up MediaRecorder with supported codec
                        const stream = canvas.captureStream(30); // 25 FPS
                        const recorder = new MediaRecorder(stream, {
                            mimeType,
                            videoBitsPerSecond: 2000000 // 1.5 Mbps
                        });

                        const chunks: Blob[] = [];
                        recorder.ondataavailable = (e) => {
                            if (e.data.size > 0) {
                                chunks.push(e.data);
                                plugin.log(`Chunk received: ${e.data.size} bytes`);
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

                        // Start recording
                        recorder.start(100); // Collect data every 100ms

                        // Draw video frames
                        let animationFrameId: number;
                        const drawFrame = () => {
                            try {
                                if (video.paused || video.ended) {
                                    cancelAnimationFrame(animationFrameId);
                                    recorder.stop();
                                    return;
                                }
                                
                                ctx.drawImage(video, 0, 0, width, height);
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

                        // Safety timeout (max 30 seconds)
                        setTimeout(() => {
                            if (recorder.state === "recording") {
                                cancelAnimationFrame(animationFrameId);
                                try {
                                    recorder.stop();
                                } catch (e) {
                                    plugin.log("Error stopping recorder:", e);
                                }
                            }
                        }, 30000);
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