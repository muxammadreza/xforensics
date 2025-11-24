// ==UserScript==
// @name         X Profile Forensics
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Advanced forensics tool: Location, Device, Shield Status, IDs, and Account History. Supports Mobile & Desktop.
// @author       A Pleasant Experience
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        bearerToken: "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        queryId: "XRqGa7EeokUU5kppkh13EA",
        features: {
            hidden_profile_subscriptions_enabled: true,
            subscriptions_verification_info_is_identity_verified_enabled: true,
            subscriptions_verification_info_verified_since_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: true,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_timeline_navigation_enabled_elsewhere: true,
            responsive_web_enhance_cards_enabled: true,
            verified_phone_label_enabled: true,
            creator_subscriptions_tweet_preview_api_enabled: true,
            highlights_tweets_tab_ui_enabled: true,
            longform_notetweets_consumption_enabled: true,
            tweetypie_unmention_optimization_enabled: true,
            vibe_api_enabled: true,
        }
    };

    // --- State & Regex ---
    const cache = {};
    let lastUrl = location.href;
    let tooltipEl = null;
    let modalEl = null;
    let hideTimeout = null;

    // Detect Mobile (User Agent or Screen Width)
    const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

    // Regex to split "United States App Store" -> "United States" + "App Store"
    const SOURCE_REGEX = /^(.*?)\s+(App\s?Store|Google\s?Play|Play\s?Store|Android\s?App|iOS\s?App)$/i;

    const COUNTRY_MAP = {
        AF: "Afghanistan", AL: "Albania", DZ: "Algeria", AD: "Andorra", AO: "Angola", AR: "Argentina", AM: "Armenia", AU: "Australia", AT: "Austria", AZ: "Azerbaijan",
        BS: "Bahamas", BH: "Bahrain", BD: "Bangladesh", BB: "Barbados", BY: "Belarus", BE: "Belgium", BZ: "Belize", BJ: "Benin", BT: "Bhutan", BO: "Bolivia", BA: "Bosnia",
        BW: "Botswana", BR: "Brazil", BG: "Bulgaria", BF: "Burkina Faso", BI: "Burundi", KH: "Cambodia", CM: "Cameroon", CA: "Canada", CL: "Chile", CN: "China", CO: "Colombia",
        CR: "Costa Rica", HR: "Croatia", CU: "Cuba", CY: "Cyprus", CZ: "Czechia", DK: "Denmark", DO: "Dominican Republic", EC: "Ecuador", EG: "Egypt", SV: "El Salvador",
        EE: "Estonia", ET: "Ethiopia", FI: "Finland", FR: "France", GE: "Georgia", DE: "Germany", GH: "Ghana", GR: "Greece", GT: "Guatemala", HN: "Honduras", HU: "Hungary",
        IS: "Iceland", IN: "India", ID: "Indonesia", IR: "Iran", IQ: "Iraq", IE: "Ireland", IL: "Israel", IT: "Italy", JM: "Jamaica", JP: "Japan", JO: "Jordan", KZ: "Kazakhstan",
        KE: "Kenya", KW: "Kuwait", LV: "Latvia", LB: "Lebanon", LY: "Libya", LT: "Lithuania", LU: "Luxembourg", MG: "Madagascar", MY: "Malaysia", MV: "Maldives", MX: "Mexico",
        MC: "Monaco", MA: "Morocco", NP: "Nepal", NL: "Netherlands", NZ: "New Zealand", NG: "Nigeria", NO: "Norway", OM: "Oman", PK: "Pakistan", PA: "Panama", PY: "Paraguay",
        PE: "Peru", PH: "Philippines", PL: "Poland", PT: "Portugal", QA: "Qatar", RO: "Romania", RU: "Russia", SA: "Saudi Arabia", SN: "Senegal", RS: "Serbia", SG: "Singapore",
        SK: "Slovakia", SI: "Slovenia", ZA: "South Africa", KR: "South Korea", ES: "Spain", LK: "Sri Lanka", SE: "Sweden", CH: "Switzerland", TW: "Taiwan", TH: "Thailand",
        TN: "Tunisia", TR: "Turkey", UA: "Ukraine", AE: "United Arab Emirates", GB: "United Kingdom", US: "United States", UY: "Uruguay", VE: "Venezuela", VN: "Vietnam",
        YE: "Yemen", ZW: "Zimbabwe"
    };

    // --- Helpers ---
    function getCsrfToken() {
        const match = document.cookie.match(/(?:^|; )ct0=([^;]+)/);
        return match ? match[1] : "";
    }

    function getUsernameFromUrl() {
        const path = window.location.pathname.split('/');
        if (path.length < 2) return null;
        const user = path[1];
        if (["home", "explore", "notifications", "messages", "i", "compose", "settings", "search"].includes(user)) return null;
        return user;
    }

    function resolveCountry(val) {
        if (!val) return "";
        return (val.length === 2 && COUNTRY_MAP[val]) ? COUNTRY_MAP[val] : val;
    }

    function formatTimestamp(ts) {
        if (!ts) return "Unknown";
        const date = new Date(isNaN(ts) ? ts : parseInt(ts));
        return date.toLocaleString(); // Returns Full Date + Time based on local locale
    }

    // --- Desktop Tooltip ---
    function showDesktopTooltip(e, htmlContent) {
        if (hideTimeout) clearTimeout(hideTimeout);

        if (!tooltipEl) {
            tooltipEl = document.createElement("div");
            tooltipEl.id = "xcb-tooltip";
            tooltipEl.style.cssText = `
                position: fixed; display: none; background: rgba(0, 0, 0, 0.95);
                color: #e7e9ea; padding: 12px; border-radius: 8px; font-size: 13px;
                width: 340px; z-index: 10000; pointer-events: auto;
                box-shadow: 0 4px 12px rgba(255,255,255,0.15); border: 1px solid #333;
                line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            // Keep open if user moves mouse into the tooltip
            tooltipEl.onmouseenter = () => clearTimeout(hideTimeout);
            tooltipEl.onmouseleave = () => hideDesktopTooltip();

            document.body.appendChild(tooltipEl);
        }
        tooltipEl.innerHTML = htmlContent;
        tooltipEl.style.display = "block";

        let top = e.clientY + 15;
        let left = e.clientX;
        if (left + 360 > window.innerWidth) left = window.innerWidth - 370;
        tooltipEl.style.top = top + "px";
        tooltipEl.style.left = left + "px";
    }

    function hideDesktopTooltip() {
        hideTimeout = setTimeout(() => {
            if (tooltipEl) tooltipEl.style.display = "none";
        }, 300);
    }

    // --- Mobile Modal ---
    function showMobileModal(htmlContent) {
        if (!modalEl) {
            modalEl = document.createElement("div");
            modalEl.id = "xcb-modal-overlay";
            modalEl.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); z-index: 99999; display: none;
                justify-content: center; align-items: center;
            `;
            modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.style.display = "none"; };
            document.body.appendChild(modalEl);
        }
        modalEl.innerHTML = `
            <div style="background:#15202b;color:#fff;width:85%;max-width:320px;padding:20px;border-radius:16px;border:1px solid #333;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:sans-serif;">
                ${htmlContent}
                <div onclick="document.getElementById('xcb-modal-overlay').style.display='none'"
                     style="margin-top:15px;padding:10px;background:#1d9bf0;text-align:center;border-radius:8px;font-weight:bold;cursor:pointer;">
                     Close
                </div>
            </div>
        `;
        modalEl.style.display = "flex";
    }

    // --- API & Analysis ---
    async function fetchInfo(username) {
        if (cache[username]) return cache[username];

        const host = window.location.host;
        const url = `https://${host}/i/api/graphql/${CONFIG.queryId}/AboutAccountQuery?variables=${encodeURIComponent(JSON.stringify({ screenName: username }))}&features=${encodeURIComponent(JSON.stringify(CONFIG.features))}&fieldToggles=${encodeURIComponent(JSON.stringify({withAuxiliaryUserLabels: false}))}`;

        try {
            const resp = await fetch(url, {
                headers: {
                    "authorization": `Bearer ${CONFIG.bearerToken}`,
                    "x-csrf-token": getCsrfToken(),
                    "content-type": "application/json"
                }
            });
            const json = await resp.json();

            const result = json?.data?.user?.result || json?.data?.user_result_by_screen_name?.result;
            if (!result) return null;

            const about = result.about_profile || result.aboutProfile || {};
            const core = result.core || result.legacy || {};
            const verif = result.verification_info || {};

            const locRaw = about.account_based_in || null;
            const sourceRaw = about.source || null;
            const isAccurate = about.location_accurate;
            const restId = result.rest_id;
            const creationDate = core.created_at;
            const nameHistory = about.username_changes || { count: "0" };
            const isIdVerified = verif.is_identity_verified === true;

            const avatarUrl = result.avatar?.image_url || "";
            const highResAvatar = avatarUrl.replace("_normal", "_400x400");

            let displayParts = [];

            // 1. Process Location
            const resolvedCountry = resolveCountry(locRaw);
            if (locRaw) displayParts.push(`📍 ${resolvedCountry}`);

            // 2. Process Source
            if (sourceRaw) {
                const match = sourceRaw.match(SOURCE_REGEX);
                if (match) {
                    const region = match[1].trim();
                    const type = match[2].toLowerCase();
                    let device = "Smartphone";
                    if (type.includes("app") || type.includes("ios")) device = "iPhone";
                    if (type.includes("play") || type.includes("android")) device = "Android";

                    if (IS_MOBILE) displayParts.push(`📱 ${device}`);
                    else displayParts.push(`📱 ${device} (Region: ${region})`);
                } else {
                    displayParts.push(`📱 ${IS_MOBILE ? "Device" : sourceRaw}`);
                }
            }

            // 3. Logic: Shield / Anomaly
            let statusHtml = "";
            let statusIconStr = "";

            const isIranAnomaly = (resolvedCountry === "Iran" && isAccurate === true);

            if (isAccurate === false) {
                // Shield Active = Proxy/VPN
                statusHtml = `<div style="background:rgba(255, 107, 107, 0.1); padding:8px; border-radius:6px; color:#ff6b6b; margin-bottom:8px; border:1px solid #ff6b6b;">🛡️ <b>Shield Active:</b><br>Proxy, VPN, or Travel Detected.</div>`;
                statusIconStr = "🛡️";
            }
            else if (isIranAnomaly) {
                // Iran + Accurate = Anomaly
                statusHtml = `<div style="background:rgba(255, 165, 0, 0.1); padding:8px; border-radius:6px; color:#ffa500; margin-bottom:8px; border:1px solid #ffa500;">⚠️ <b>Anomaly Detected:</b><br>Direct access blocked in Iran.<br>This can be caused by parameters like direct access using white simcards, serverless configs, sign-up using local numbers, etc.</div>`;
                statusIconStr = "⚠️";
            }
            else {
                // Safe = Direct
                statusHtml = `<div style="background:rgba(0, 186, 124, 0.1); padding:8px; border-radius:6px; color:#00ba7c; margin-bottom:8px; border:1px solid #00ba7c;">✅ <b>High Confidence:</b><br>Direct access using white simcards, serverless configs, sign-up using local numbers, etc.</div>`;
                statusIconStr = "✅";
            }

            // 4. Build Report HTML
            let detailHTML = `<h3 style="margin:0 0 10px 0; border-bottom:1px solid #555; padding-bottom:8px;">Forensics Report</h3>`;
            detailHTML += statusHtml;

            if (isIdVerified) {
                detailHTML += `<div style="margin-bottom:4px;"><b>🪪 Identity:</b> <span style="color:#00ba7c">Government ID Verified</span></div>`;
            }

            detailHTML += `<hr style="border:0;border-top:1px solid #444;margin:8px 0;">`;

            if(sourceRaw) detailHTML += `<div style="margin-bottom:4px;"><b>📱 Device Source:</b><br>${sourceRaw}</div>`;
            detailHTML += `<div style="margin-bottom:4px;"><b>🆔 Permanent ID:</b> <span style="font-family:monospace;background:#000;padding:2px 4px;border-radius:3px;">${restId}</span></div>`;
            detailHTML += `<div style="margin-bottom:8px;"><b>📅 Created:</b><br>${formatTimestamp(creationDate)}</div>`;

            const renameCount = parseInt(nameHistory.count || 0);
            if (renameCount > 0) {
                detailHTML += `<div style="color:#ffa500; font-weight:bold; margin-top:5px;">⚠️ Renamed ${renameCount} time(s)</div>`;
            }

            detailHTML += `<div style="margin-top:12px;text-align:center;"><a href="${highResAvatar}" target="_blank" style="color:#1d9bf0;text-decoration:none;font-weight:bold;border:1px solid #1d9bf0;padding:4px 12px;border-radius:12px;">🔎 View Original Avatar</a></div>`;

            cache[username] = {
                text: displayParts.join(" | "),
                hasData: displayParts.length > 0,
                tooltip: detailHTML,
                icon: statusIconStr
            };

            return cache[username];

        } catch (e) {
            console.error("Fetch Error", e);
            return null;
        }
    }

    // --- Injection ---
    function injectLabel(data) {
        const headerItems = document.querySelector('[data-testid="UserProfileHeader_Items"]');
        if (!headerItems) return;

        const oldLabel = document.getElementById("x-geo-info");
        if (oldLabel) oldLabel.remove();

        if (!data.hasData) return;

        const container = document.createElement("div");
        container.id = "x-geo-info";
        // Styling based on device type
        container.style.cssText = IS_MOBILE
            ? "display:flex; align-items:center; color:#71767b; font-size:13px; margin-right:10px; margin-bottom:4px; flex-wrap:wrap;"
            : "display:flex; align-items:center; color:#71767b; font-size:14px; margin-right:15px;";

        const textSpan = document.createElement("span");
        textSpan.style.cssText = "color:#1d9bf0; font-weight:bold; margin-right:6px;";
        textSpan.innerText = data.text;
        container.appendChild(textSpan);

        const statusIcon = document.createElement("span");
        statusIcon.style.cssText = IS_MOBILE
            ? "font-size:16px; padding:4px; cursor:pointer;"
            : "font-size:16px; cursor:help;";

        statusIcon.innerText = data.icon;

        // Bind Interaction
        if (IS_MOBILE) {
            statusIcon.onclick = (e) => {
                e.stopPropagation();
                showMobileModal(data.tooltip);
            };
        } else {
            statusIcon.onmouseenter = (e) => showDesktopTooltip(e, data.tooltip);
            statusIcon.onmouseleave = () => hideDesktopTooltip();
        }

        container.appendChild(statusIcon);
        headerItems.insertBefore(container, headerItems.firstChild);
    }

    async function checkProfile() {
        const username = getUsernameFromUrl();
        if (!username) return;

        const existing = document.getElementById("x-geo-info");
        if (existing && existing.dataset.user === username) return;

        const info = await fetchInfo(username);

        if (getUsernameFromUrl() !== username) return;

        if (info) {
            injectLabel(info);
            const el = document.getElementById("x-geo-info");
            if (el) el.dataset.user = username;
        }
    }

    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            const existing = document.getElementById("x-geo-info");
            if (existing) existing.remove();
            if(!IS_MOBILE) hideDesktopTooltip();
        }
        if (document.querySelector('[data-testid="UserProfileHeader_Items"]')) {
            checkProfile();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
