import { Plugin } from "@utils/types";
import { findByProps } from "@webpack";
import { React } from "@webpack/common";
import Logger from "./Logger";

export default {
    name: "VideoComp",
    description: "Adds a button to compress and upload videos under 10MB",
    authors: [{ name: "diego.ffm320" }],
    observer: null as MutationObserver | null,
    intervalId: null as NodeJS.Timeout | null,
    buttonInjected: false,
    lastChannelId: null as string | null,
    logger: new Logger("VideoComp"),

    log(...args: any[]) {
        console.log(`[${this.name}]`, ...args);
    },

    start() {
        this.log("Starting plugin...");
        this.tryInjectButton();

        this.intervalId = setInterval(() => {
            const currentChannelId = this.getCurrentChannelId();
            if (currentChannelId !== this.lastChannelId) {
                this.log(`Channel changed: ${this.lastChannelId} -> ${currentChannelId}`);
                this.lastChannelId = currentChannelId;
                this.buttonInjected = false;
            }
            
            if (!this.buttonInjected) {
                this.tryInjectButton();
            }
        }, 1000);

        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.target && 
                   (mutation.target.className?.includes?.('buttons__74017') ||
                    mutation.target.className?.includes?.('buttons') || 
                    mutation.target.className?.includes?.('toolbar') || 
                    mutation.target.className?.includes?.('attach'))) {
                    
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

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        if (this.observer) this.observer.disconnect();
        this.removeButton();
    },

    findButtonContainer(): Element | null {
        const container = document.querySelector('[class^="buttons_"]') || 
                         document.querySelector('[class*=" buttons_"]') ||
                         document.querySelector('.buttons-3JBrkn') ||
                         document.querySelector('.attachButton-3JtTw3');
        
        if (container) {
            return container;
        }
        
        const attachmentButtons = document.querySelectorAll('button[aria-label="Attach file"]');
        if (attachmentButtons.length > 0) {
            for (const btn of attachmentButtons) {
                const parent = btn.closest('div');
                if (parent) {
                    return parent;
                }
            }
        }
        
        return null;
    },

    tryInjectButton() {
        if (this.buttonInjected) return;

        const container = this.findButtonContainer();
        if (container) {
            if (!document.getElementById("video-comp-btn")) {
                this.injectButton(container);
            } else {
                this.buttonInjected = true;
            }
        }
    },

    injectButton(container: Element) {
        if (document.getElementById("video-comp-btn")) {
            this.buttonInjected = true;
            return;
        }
    
        this.lastChannelId = this.getCurrentChannelId();
    
        const btn = document.createElement("div");
        btn.id = "video-comp-btn";
        btn.style.display = "flex";
        btn.style.alignItems = "center";
    
        try {
            const ButtonComponent = this.createCompressButtonComponent();
            const reactDOM = findByProps("render", "createRoot", "hydrate") || 
                           findByProps("render", "hydrate");

            if (reactDOM?.createRoot) {
                reactDOM.createRoot(btn).render(React.createElement(ButtonComponent));
            } else if (reactDOM?.render) {
                reactDOM.render(React.createElement(ButtonComponent), btn);
            } else {
                const instance = new ButtonComponent({});
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
            }
    
            container.append(btn);
            this.buttonInjected = true;
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
            } catch (error) {
                console.error("[VideoComp] Error removing button:", error);
                btn.remove();
            }
        }
    },

    getCurrentChannelId(): string | null {
        const urlMatch = window.location.href.match(/channels\/\d+\/(\d+)/);
        if (urlMatch?.[1]) {
            return urlMatch[1];
        }
        
        try {
            const channelStore = findByProps("getChannelId", "getLastSelectedChannelId");
            if (channelStore && typeof channelStore.getChannelId === "function") {
                const channelId = channelStore.getChannelId();
                if (channelId) {
                    return channelId;
                }
            }
        } catch (err) {
            this.log("Error getting channel from store:", err);
        }

        return null;
    },

    createCompressButtonComponent() {
        const plugin = this;

        return class CompressButton extends React.Component {
            state = {
                isCompressing: false,
                uploadProgress: 0,
                currentMethod: "",
                error: ""
            };

            compressVideo(file: File): Promise<File> {
                return new Promise((resolve, reject) => {
                    const video = document.createElement("video");
                    video.src = URL.createObjectURL(file);
                    video.muted = true;
                    video.playsInline = true;
            
                    video.onerror = () => {
                        reject(new Error("Failed to load video file"));
                        URL.revokeObjectURL(video.src);
                    };
            
                    video.onloadedmetadata = () => {
                        const targetWidth = 1080; // Fixed resolution
                        const targetHeight = Math.floor((targetWidth / video.videoWidth) * video.videoHeight);
                        let width = video.videoWidth;
                        let height = video.videoHeight;
            
                        const ratio = Math.min(targetWidth / width, targetHeight / height);
                        width = Math.floor(width * ratio);
                        height = Math.floor(height * ratio);
            
                        const canvas = document.createElement("canvas");
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext("2d", { alpha: false });
                        if (!ctx) {
                            reject(new Error("Could not get canvas context"));
                            return;
                        }
                        
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
            
                        const videoBitsPerSecond = 500000; // Fixed bitrate
                        const playbackRate = 1.5;
                        video.playbackRate = playbackRate;
                        const fps = 25;
                        
                        const stream = canvas.captureStream(fps);
                        const recorder = new MediaRecorder(stream, {
                            mimeType,
                            videoBitsPerSecond
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
            
                        recorder.start(500);
            
                        let frameCount = 0;
                        const frameSkip = 1;
                        let animationFrameId: number;
                        
                        const drawFrame = () => {
                            try {
                                if (video.paused || video.ended) {
                                    cancelAnimationFrame(animationFrameId);
                                    recorder.stop();
                                    return;
                                }
                                
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
            
                        video.play().catch(err => {
                            reject(new Error(`Video play failed: ${err}`));
                        });
            
                        drawFrame();
            
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
            
                        const safetyTimeout = Math.min(
                            Math.max((video.duration / playbackRate) * 1000 * 1.2, 30000),
                            180000
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

            getDiscordToken(): string | null {
                try {
                    if (window.localStorage) {
                        const token = window.localStorage.getItem('token');
                        if (token) {
                            return token.replace(/"/g, '');
                        }
                    }
                    
                    try {
                        const tokenModule = findByProps('getToken');
                        if (tokenModule && tokenModule.getToken && typeof tokenModule.getToken === 'function') {
                            const token = tokenModule.getToken();
                            if (token) return token;
                        }
                    } catch (e) {
                        plugin.log("Error getting token from modules:", e);
                    }

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

            async uploadToDiscord(file: File) {
                const channelId = plugin.getCurrentChannelId();
                if (!channelId) throw new Error("Couldn't determine channel ID");
                
                this.setState({ currentMethod: "Uploading..." });
                return this.tryDirectUpload(file, channelId);
            }

            async tryDirectUpload(file: File, channelId: string): Promise<void> {
                return new Promise((resolve, reject) => {
                    const token = this.getDiscordToken();
                    
                    if (!token) {
                        return reject(new Error("No authentication token found"));
                    }

                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('content', '');
                    
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', `https://discord.com/api/v9/channels/${channelId}/messages`);
                    xhr.setRequestHeader('Authorization', token);
                    xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                    
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve();
                        } else {
                            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
                        }
                    };

                    xhr.onerror = () => {
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

            handleClick = async () => {
                if (this.state.isCompressing) return;

                this.setState({ 
                    isCompressing: true,
                    uploadProgress: 0,
                    currentMethod: "",
                    error: ""
                });

                try {
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
                    
                    const maxSize = 10 * 1024 * 1024;
                    let fileToUpload = file;
                    if (file.size > maxSize) {
                        this.setState({ currentMethod: "Compressing video..." });
                        try {
                            const compressed = await this.compressVideo(file);
                            const compressedSizeMB = (compressed.size / 1024 / 1024).toFixed(2);
                            
                            if (compressed.size > maxSize) {
                                throw new Error(`Couldn't compress below 10MB (${compressedSizeMB}MB)`);
                            }
                            
                            fileToUpload = compressed;
                        } catch (err) {
                            throw new Error(`Compression failed: ${err instanceof Error ? err.message : String(err)}`);
                        }
                    }

                    await this.uploadToDiscord(fileToUpload);
                    this.setState({ currentMethod: "Upload successful!" });
                    
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
                        isCompressing ? 
                            (currentMethod?.includes("Compressing") ? "🔄" : 
                             currentMethod?.includes("Upload") ? "📤" : "⏳") 
                            : "🎥"
                    ),
                    
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