"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedInProfileScraper = void 0;
const tslib_1 = require("tslib");
const puppeteer_1 = tslib_1.__importDefault(require("puppeteer"));
const tree_kill_1 = tslib_1.__importDefault(require("tree-kill"));
const blocked_hosts_1 = tslib_1.__importDefault(require("./blocked-hosts"));
const utils_1 = require("./utils");
const errors_1 = require("./errors");
function autoScroll(page) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        yield page.evaluate(() => {
            return new Promise((resolve, reject) => {
                var totalHeight = 0;
                var distance = 500;
                var timer = setInterval(() => {
                    var scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    });
}
class LinkedInProfileScraper {
    constructor(userDefinedOptions) {
        this.options = {
            sessionCookieValue: '',
            keepAlive: false,
            timeout: 10000,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
            headless: true
        };
        this.browser = null;
        this.launched = false;
        this.setup = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const logSection = 'setup';
            try {
                utils_1.statusLog(logSection, `Launching puppeteer in the ${this.options.headless ? 'background' : 'foreground'}...`);
                this.browser = yield puppeteer_1.default.launch({
                    headless: this.options.headless,
                    args: [
                        ...(this.options.headless ? '---single-process' : '---start-maximized'),
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        "--proxy-server='direct://",
                        '--proxy-bypass-list=*',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--disable-gpu',
                        '--disable-features=site-per-process',
                        '--enable-features=NetworkService',
                        '--allow-running-insecure-content',
                        '--enable-automation',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-web-security',
                        '--autoplay-policy=user-gesture-required',
                        '--disable-background-networking',
                        '--disable-breakpad',
                        '--disable-client-side-phishing-detection',
                        '--disable-component-update',
                        '--disable-default-apps',
                        '--disable-domain-reliability',
                        '--disable-extensions',
                        '--disable-features=AudioServiceOutOfProcess',
                        '--disable-hang-monitor',
                        '--disable-ipc-flooding-protection',
                        '--disable-notifications',
                        '--disable-offer-store-unmasked-wallet-cards',
                        '--disable-popup-blocking',
                        '--disable-print-preview',
                        '--disable-prompt-on-repost',
                        '--disable-speech-api',
                        '--disable-sync',
                        '--disk-cache-size=33554432',
                        '--hide-scrollbars',
                        '--ignore-gpu-blacklist',
                        '--metrics-recording-only',
                        '--mute-audio',
                        '--no-default-browser-check',
                        '--no-first-run',
                        '--no-pings',
                        '--no-zygote',
                        '--password-store=basic',
                        '--use-gl=swiftshader',
                        '--use-mock-keychain'
                    ],
                    timeout: this.options.timeout
                });
                this.launched = true;
                utils_1.statusLog(logSection, 'Puppeteer launched!');
                yield this.checkIfLoggedIn();
                utils_1.statusLog(logSection, 'Done!');
            }
            catch (err) {
                yield this.close();
                utils_1.statusLog(logSection, 'An error occurred during setup.');
                throw err;
            }
        });
        this.isPuppeteerLoaded = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.launched;
        });
        this.createPage = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const logSection = 'setup page';
            if (!this.browser) {
                throw new Error('Browser not set.');
            }
            const blockedResources = ['media', 'font', 'texttrack', 'object', 'beacon', 'csp_report', 'imageset'];
            try {
                const page = yield this.browser.newPage();
                const firstPage = (yield this.browser.pages())[0];
                yield firstPage.close();
                const session = yield page.target().createCDPSession();
                yield page.setBypassCSP(true);
                yield session.send('Page.enable');
                yield session.send('Page.setWebLifecycleState', {
                    state: 'active',
                });
                utils_1.statusLog(logSection, `Blocking the following resources: ${blockedResources.join(', ')}`);
                const blockedHosts = this.getBlockedHosts();
                const blockedResourcesByHost = ['script', 'xhr', 'fetch', 'document'];
                utils_1.statusLog(logSection, `Should block scripts from ${Object.keys(blockedHosts).length} unwanted hosts to speed up the crawling.`);
                yield page.setRequestInterception(true);
                page.on('request', (req) => {
                    if (blockedResources.includes(req.resourceType())) {
                        return req.abort();
                    }
                    const hostname = utils_1.getHostname(req.url());
                    if (blockedResourcesByHost.includes(req.resourceType()) && hostname && blockedHosts[hostname] === true) {
                        utils_1.statusLog('blocked script', `${req.resourceType()}: ${hostname}: ${req.url()}`);
                        return req.abort();
                    }
                    return req.continue();
                });
                yield page.setUserAgent(this.options.userAgent);
                yield page.setViewport({
                    width: 1200,
                    height: 720
                });
                utils_1.statusLog(logSection, `Setting session cookie using cookie: ${process.env.LINKEDIN_SESSION_COOKIE_VALUE}`);
                yield page.setCookie({
                    'name': 'li_at',
                    'value': this.options.sessionCookieValue,
                    'domain': '.www.linkedin.com'
                });
                utils_1.statusLog(logSection, 'Session cookie set!');
                utils_1.statusLog(logSection, 'Done!');
                return page;
            }
            catch (err) {
                yield this.close();
                utils_1.statusLog(logSection, 'An error occurred during page setup.');
                utils_1.statusLog(logSection, err.message);
                throw err;
            }
        });
        this.getBlockedHosts = () => {
            const blockedHostsArray = blocked_hosts_1.default.split('\n');
            let blockedHostsObject = blockedHostsArray.reduce((prev, curr) => {
                const frags = curr.split(' ');
                if (frags.length > 1 && frags[0] === '0.0.0.0') {
                    prev[frags[1].trim()] = true;
                }
                return prev;
            }, {});
            blockedHostsObject = Object.assign(Object.assign({}, blockedHostsObject), { 'static.chartbeat.com': true, 'scdn.cxense.com': true, 'api.cxense.com': true, 'www.googletagmanager.com': true, 'connect.facebook.net': true, 'platform.twitter.com': true, 'tags.tiqcdn.com': true, 'dev.visualwebsiteoptimizer.com': true, 'smartlock.google.com': true, 'cdn.embedly.com': true, 'www.pagespeed-mod.com': true, 'ssl.google-analytics.com': true, 'radar.cedexis.com': true, 'sb.scorecardresearch.com': true });
            return blockedHostsObject;
        };
        this.close = (page) => {
            return new Promise((resolve, reject) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                const loggerPrefix = 'close';
                this.launched = false;
                if (page) {
                    try {
                        utils_1.statusLog(loggerPrefix, 'Closing page...');
                        yield page.close();
                        utils_1.statusLog(loggerPrefix, 'Closed page!');
                    }
                    catch (err) {
                        reject(err);
                    }
                }
                if (this.browser) {
                    try {
                        utils_1.statusLog(loggerPrefix, 'Closing browser...');
                        yield this.browser.close();
                        utils_1.statusLog(loggerPrefix, 'Closed browser!');
                        const browserProcessPid = this.browser.process().pid;
                        if (browserProcessPid) {
                            utils_1.statusLog(loggerPrefix, `Killing browser process pid: ${browserProcessPid}...`);
                            tree_kill_1.default(browserProcessPid, 'SIGKILL', (err) => {
                                if (err) {
                                    return reject(`Failed to kill browser process pid: ${browserProcessPid}`);
                                }
                                utils_1.statusLog(loggerPrefix, `Killed browser pid: ${browserProcessPid} Closed browser.`);
                                resolve();
                            });
                        }
                    }
                    catch (err) {
                        reject(err);
                    }
                }
                return resolve();
            }));
        };
        this.checkIfLoggedIn = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const logSection = 'checkIfLoggedIn';
            const page = yield this.createPage();
            utils_1.statusLog(logSection, 'Checking if we are still logged in...');
            yield page.goto('https://www.linkedin.com/login', {
                waitUntil: 'networkidle2',
                timeout: this.options.timeout
            });
            const url = page.url();
            const isLoggedIn = !url.endsWith('/login');
            yield page.close();
            if (isLoggedIn) {
                utils_1.statusLog(logSection, 'All good. We are still logged in.');
            }
            else {
                const errorMessage = 'Bad news, we are not logged in! Your session seems to be expired. Use your browser to login again with your LinkedIn credentials and extract the "li_at" cookie value for the "sessionCookieValue" option.';
                utils_1.statusLog(logSection, errorMessage);
                throw new errors_1.SessionExpired(errorMessage);
            }
        });
        this.run = (profileUrl) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const logSection = 'run';
            const scraperSessionId = new Date().getTime();
            if (!this.browser) {
                throw new Error('Browser is not set. Please run the setup method first.');
            }
            if (!profileUrl) {
                throw new Error('No profileUrl given.');
            }
            if (!profileUrl.includes('linkedin.com/')) {
                throw new Error('The given URL to scrape is not a linkedin.com url.');
            }
            try {
                const page = yield this.createPage();
                utils_1.statusLog(logSection, `Navigating to LinkedIn profile: ${profileUrl}`, scraperSessionId);
                yield page.goto(profileUrl, {
                    waitUntil: 'networkidle2',
                    timeout: this.options.timeout
                });
                utils_1.statusLog(logSection, 'LinkedIn profile page loaded!', scraperSessionId);
                utils_1.statusLog(logSection, 'Getting all the LinkedIn profile data by scrolling the page to the bottom, so all the data gets loaded into the page...', scraperSessionId);
                yield autoScroll(page);
                utils_1.statusLog(logSection, 'Parsing data...', scraperSessionId);
                const expandButtonsSelectors = [
                    '.pv-profile-section.pv-about-section .lt-line-clamp__more',
                    '#experience-section .inline-show-more-text__button.link',
                    '#experience-section [aria-expanded="false"]',
                    '#certifications-section [aria-expanded="false"]',
                    '.pv-profile-section.education-section button.pv-profile-section__see-more-inline',
                    '[aria-controls="skill-categories-expanded"]'
                ];
                const seeMoreButtonsSelectors = [
                    '.pv-entity__description .lt-line-clamp__line.lt-line-clamp__line--last .lt-line-clamp__more[href="#"]',
                    '.pv-profile-section__see-more-inline',
                    '.inline-show-more-text__button',
                    '.pv-profile-section__see-more-inline.pv-profile-section__text-truncate-toggle.artdeco-button.artdeco-button--tertiary.artdeco-button--muted',
                    '.pv-entity__paging button.pv-profile-section__see-more-inline',
                    '#experience-section [aria-expanded="false"]'
                ];
                utils_1.statusLog(logSection, 'Expanding all sections by clicking their "See more" buttons', scraperSessionId);
                for (const buttonSelector of expandButtonsSelectors) {
                    try {
                        if ((yield page.$(buttonSelector)) != null) {
                            utils_1.statusLog(logSection, `Clicking button ${buttonSelector}`, scraperSessionId);
                            yield page.click(buttonSelector);
                            yield page.waitFor(100);
                            if (buttonSelector.startsWith('#certifications-section')) {
                                while ((yield page.$(buttonSelector)) != null) {
                                    yield page.click(buttonSelector);
                                    yield page.waitFor(100);
                                }
                            }
                        }
                    }
                    catch (err) {
                        utils_1.statusLog(logSection, `Could not find or click expand button selector "${buttonSelector}". So we skip that one.`, scraperSessionId);
                    }
                }
                yield page.waitFor(200);
                utils_1.statusLog(logSection, 'Expanding all descriptions by clicking their "See more" buttons', scraperSessionId);
                for (const seeMoreButtonSelector of seeMoreButtonsSelectors) {
                    const buttons = yield page.$$(seeMoreButtonSelector);
                    for (const button of buttons) {
                        if (button) {
                            try {
                                utils_1.statusLog(logSection, `Clicking button ${seeMoreButtonSelector}`, scraperSessionId);
                                yield button.click();
                                yield page.waitFor(100);
                            }
                            catch (err) {
                                utils_1.statusLog(logSection, `Could not find or click see more button selector "${button}". So we skip that one.`, scraperSessionId);
                            }
                        }
                    }
                }
                yield page.waitFor(200);
                utils_1.statusLog(logSection, 'Parsing profile data...', scraperSessionId);
                const rawUserProfileData = yield page.evaluate(() => {
                    const profileSection = document.querySelector('.pv-top-card');
                    const url = window.location.href;
                    const fullNameElement = profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector('.text-heading-xlarge.inline');
                    const fullName = (fullNameElement === null || fullNameElement === void 0 ? void 0 : fullNameElement.textContent) || null;
                    const titleElement = profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector('.text-body-medium.break-words');
                    const title = (titleElement === null || titleElement === void 0 ? void 0 : titleElement.textContent) || null;
                    const locationElement = profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector('.text-body-small.inline.t-black--light.break-words');
                    const location = (locationElement === null || locationElement === void 0 ? void 0 : locationElement.textContent) || null;
                    const photoElement = (profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector('.pv-top-card-profile-picture__image.pv-top-card-profile-picture__image--show')) || (profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector('.profile-photo-edit__preview'));
                    const photo = (photoElement === null || photoElement === void 0 ? void 0 : photoElement.getAttribute('src')) || null;
                    const descriptionElement = document.querySelector('.pv-about-section');
                    const description = (descriptionElement === null || descriptionElement === void 0 ? void 0 : descriptionElement.textContent) || null;
                    return {
                        fullName,
                        title,
                        location,
                        photo,
                        description,
                        url
                    };
                });
                const userProfile = Object.assign(Object.assign({}, rawUserProfileData), { fullName: utils_1.getCleanText(rawUserProfileData.fullName), title: utils_1.getCleanText(rawUserProfileData.title), location: rawUserProfileData.location ? utils_1.getLocationFromText(rawUserProfileData.location) : null, description: utils_1.getCleanText(rawUserProfileData.description) });
                utils_1.statusLog(logSection, `Got user profile data: ${JSON.stringify(userProfile)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing experiences data...`, scraperSessionId);
                const rawExperiencesData = yield page.$$eval('#experience-section ul > .ember-view, #experience-section .pv-entity__position-group-role-item-fading-timeline, #experience-section .pv-entity__position-group-role-item', (nodes) => {
                    let data = [];
                    let currentCompanySummary = {};
                    for (const node of nodes) {
                        let title, employmentType, company, description, startDate, endDate, dateRangeText, endDateIsPresent, location;
                        if (node.querySelector('.pv-entity__company-summary-info') != null) {
                            const companyElement = node.querySelector('.pv-entity__company-summary-info span:nth-child(2)');
                            currentCompanySummary['company_name'] = (companyElement === null || companyElement === void 0 ? void 0 : companyElement.textContent) || null;
                            const descriptionElement = node.querySelector('.pv-entity__description');
                            currentCompanySummary[''] = (descriptionElement === null || descriptionElement === void 0 ? void 0 : descriptionElement.textContent) || null;
                            continue;
                        }
                        if (node.querySelector('[data-control-name="background_details_company"]') != null) {
                            currentCompanySummary = {};
                        }
                        if (Object.keys(currentCompanySummary).length !== 0) {
                            const titleElement = node.querySelector('h3 span:nth-child(2)');
                            title = (titleElement === null || titleElement === void 0 ? void 0 : titleElement.textContent) || null;
                            const employmentTypeElement = node.querySelector('h4');
                            employmentType = (employmentTypeElement === null || employmentTypeElement === void 0 ? void 0 : employmentTypeElement.textContent) || null;
                            company = currentCompanySummary['company_name'];
                        }
                        else {
                            const titleElement = node.querySelector('h3');
                            title = (titleElement === null || titleElement === void 0 ? void 0 : titleElement.textContent) || null;
                            const employmentTypeElement = node.querySelector('span.pv-entity__secondary-title');
                            employmentType = (employmentTypeElement === null || employmentTypeElement === void 0 ? void 0 : employmentTypeElement.textContent) || null;
                            const companyElement = node.querySelector('.pv-entity__secondary-title');
                            const companyElementClean = companyElement && (companyElement === null || companyElement === void 0 ? void 0 : companyElement.querySelector('span')) ? (companyElement === null || companyElement === void 0 ? void 0 : companyElement.removeChild(companyElement.querySelector('span'))) && companyElement : companyElement || null;
                            company = (companyElementClean === null || companyElementClean === void 0 ? void 0 : companyElementClean.textContent) || null;
                        }
                        const descriptionElement = node.querySelector('.pv-entity__description');
                        description = (descriptionElement === null || descriptionElement === void 0 ? void 0 : descriptionElement.textContent) || null;
                        const dateRangeElement = node.querySelector('.pv-entity__date-range span:nth-child(2)');
                        dateRangeText = (dateRangeElement === null || dateRangeElement === void 0 ? void 0 : dateRangeElement.textContent) || null;
                        const startDatePart = (dateRangeText === null || dateRangeText === void 0 ? void 0 : dateRangeText.split('–')[0]) || null;
                        startDate = (startDatePart === null || startDatePart === void 0 ? void 0 : startDatePart.trim()) || null;
                        const endDatePart = (dateRangeText === null || dateRangeText === void 0 ? void 0 : dateRangeText.split('–')[1]) || null;
                        endDateIsPresent = (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase()) === 'present' || false;
                        endDate = (endDatePart && !endDateIsPresent) ? endDatePart.trim() : 'Present';
                        const locationElement = node.querySelector('.pv-entity__location span:nth-child(2)');
                        location = (locationElement === null || locationElement === void 0 ? void 0 : locationElement.textContent) || null;
                        data.push({
                            title,
                            company,
                            employmentType,
                            location,
                            startDate,
                            endDate,
                            endDateIsPresent,
                            description
                        });
                    }
                    return data;
                });
                const experiences = rawExperiencesData.map((rawExperience) => {
                    const startDate = utils_1.formatDate(rawExperience.startDate);
                    const endDate = utils_1.formatDate(rawExperience.endDate) || null;
                    const endDateIsPresent = rawExperience.endDateIsPresent;
                    const durationInDaysWithEndDate = (startDate && endDate && !endDateIsPresent) ? utils_1.getDurationInDays(startDate, endDate) : null;
                    const durationInDaysForPresentDate = (endDateIsPresent && startDate) ? utils_1.getDurationInDays(startDate, new Date()) : null;
                    const durationInDays = endDateIsPresent ? durationInDaysForPresentDate : durationInDaysWithEndDate;
                    let cleanedEmploymentType = utils_1.getCleanText(rawExperience.employmentType);
                    if (cleanedEmploymentType && ![
                        'Full-time',
                        'Part-time',
                        'Self-employed',
                        'Freelance',
                        'Contract',
                        'Seasonal',
                        'Internship',
                        'Apprenticeship'
                    ].includes(cleanedEmploymentType)) {
                        cleanedEmploymentType = null;
                    }
                    return Object.assign(Object.assign({}, rawExperience), { title: utils_1.getCleanText(rawExperience.title), company: utils_1.getCleanText(rawExperience.company), employmentType: cleanedEmploymentType, location: (rawExperience === null || rawExperience === void 0 ? void 0 : rawExperience.location) ? utils_1.getLocationFromText(rawExperience.location) : null, startDate,
                        endDate,
                        endDateIsPresent,
                        durationInDays, description: utils_1.getCleanText(rawExperience.description) });
                });
                utils_1.statusLog(logSection, `Got experiences data: ${JSON.stringify(experiences)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing education data...`, scraperSessionId);
                const rawCertificationData = yield page.$$eval('#certifications-section ul > .ember-view', (nodes) => {
                    var _a;
                    let data = [];
                    for (const node of nodes) {
                        const nameElement = node.querySelector('h3');
                        const name = (nameElement === null || nameElement === void 0 ? void 0 : nameElement.textContent) || null;
                        const issuingOrganizationElement = node.querySelector('p span:nth-child(2)');
                        const issuingOrganization = (issuingOrganizationElement === null || issuingOrganizationElement === void 0 ? void 0 : issuingOrganizationElement.textContent) || null;
                        const expirationDateElement = node.querySelector('.pv-entity__bullet-item-v2');
                        const expirationDate = (expirationDateElement === null || expirationDateElement === void 0 ? void 0 : expirationDateElement.textContent) || null;
                        let issueDate;
                        if (expirationDate) {
                            const issueDateElement = node.querySelectorAll('p span:not(.pv-entity__bullet-item-v2)')[3];
                            issueDate = ((_a = issueDateElement === null || issueDateElement === void 0 ? void 0 : issueDateElement.textContent) === null || _a === void 0 ? void 0 : _a.replace(expirationDate, '')) || null;
                        }
                        else {
                            issueDate = null;
                        }
                        data.push({
                            name,
                            issuingOrganization,
                            issueDate,
                            expirationDate
                        });
                    }
                    return data;
                });
                const certifications = rawCertificationData.map(rawCertification => {
                    return Object.assign(Object.assign({}, rawCertification), { name: utils_1.getCleanText(rawCertification.name), issuingOrganization: utils_1.getCleanText(rawCertification.issuingOrganization), issueDate: utils_1.getCleanText(rawCertification.issueDate), expirationDate: utils_1.getCleanText(rawCertification.expirationDate) });
                });
                utils_1.statusLog(logSection, `Got certification data: ${JSON.stringify(certifications)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing education data...`, scraperSessionId);
                const rawEducationData = yield page.$$eval('#education-section ul > .ember-view', (nodes) => {
                    var _a, _b;
                    let data = [];
                    for (const node of nodes) {
                        const schoolNameElement = node.querySelector('h3.pv-entity__school-name');
                        const schoolName = (schoolNameElement === null || schoolNameElement === void 0 ? void 0 : schoolNameElement.textContent) || null;
                        const degreeNameElement = node.querySelector('.pv-entity__degree-name .pv-entity__comma-item');
                        const degreeName = (degreeNameElement === null || degreeNameElement === void 0 ? void 0 : degreeNameElement.textContent) || null;
                        const fieldOfStudyElement = node.querySelector('.pv-entity__fos .pv-entity__comma-item');
                        const fieldOfStudy = (fieldOfStudyElement === null || fieldOfStudyElement === void 0 ? void 0 : fieldOfStudyElement.textContent) || null;
                        const dateRangeElement = node.querySelectorAll('.pv-entity__dates time');
                        const startDatePart = dateRangeElement && ((_a = dateRangeElement[0]) === null || _a === void 0 ? void 0 : _a.textContent) || null;
                        const startDate = startDatePart || null;
                        const endDatePart = dateRangeElement && ((_b = dateRangeElement[1]) === null || _b === void 0 ? void 0 : _b.textContent) || null;
                        const endDate = endDatePart || null;
                        data.push({
                            schoolName,
                            degreeName,
                            fieldOfStudy,
                            startDate,
                            endDate
                        });
                    }
                    return data;
                });
                const education = rawEducationData.map(rawEducation => {
                    const startDate = utils_1.formatDate(rawEducation.startDate);
                    const endDate = utils_1.formatDate(rawEducation.endDate);
                    return Object.assign(Object.assign({}, rawEducation), { schoolName: utils_1.getCleanText(rawEducation.schoolName), degreeName: utils_1.getCleanText(rawEducation.degreeName), fieldOfStudy: utils_1.getCleanText(rawEducation.fieldOfStudy), startDate,
                        endDate, durationInDays: utils_1.getDurationInDays(startDate, endDate) });
                });
                utils_1.statusLog(logSection, `Got education data: ${JSON.stringify(education)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing volunteer experience data...`, scraperSessionId);
                const rawVolunteerExperiences = yield page.$$eval('.pv-profile-section.volunteering-section ul > li.ember-view', (nodes) => {
                    let data = [];
                    for (const node of nodes) {
                        const titleElement = node.querySelector('.pv-entity__summary-info h3');
                        const title = (titleElement === null || titleElement === void 0 ? void 0 : titleElement.textContent) || null;
                        const companyElement = node.querySelector('.pv-entity__summary-info span.pv-entity__secondary-title');
                        const company = (companyElement === null || companyElement === void 0 ? void 0 : companyElement.textContent) || null;
                        const dateRangeElement = node.querySelector('.pv-entity__date-range span:nth-child(2)');
                        const dateRangeText = (dateRangeElement === null || dateRangeElement === void 0 ? void 0 : dateRangeElement.textContent) || null;
                        const startDatePart = (dateRangeText === null || dateRangeText === void 0 ? void 0 : dateRangeText.split('–')[0]) || null;
                        const startDate = (startDatePart === null || startDatePart === void 0 ? void 0 : startDatePart.trim()) || null;
                        const endDatePart = (dateRangeText === null || dateRangeText === void 0 ? void 0 : dateRangeText.split('–')[1]) || null;
                        const endDateIsPresent = (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase()) === 'present' || false;
                        const endDate = (endDatePart && !endDateIsPresent) ? endDatePart.trim() : 'Present';
                        const descriptionElement = node.querySelector('.pv-entity__description');
                        const description = (descriptionElement === null || descriptionElement === void 0 ? void 0 : descriptionElement.textContent) || null;
                        data.push({
                            title,
                            company,
                            startDate,
                            endDate,
                            endDateIsPresent,
                            description
                        });
                    }
                    return data;
                });
                const volunteerExperiences = rawVolunteerExperiences.map(rawVolunteerExperience => {
                    const startDate = utils_1.formatDate(rawVolunteerExperience.startDate);
                    const endDate = utils_1.formatDate(rawVolunteerExperience.endDate);
                    return Object.assign(Object.assign({}, rawVolunteerExperience), { title: utils_1.getCleanText(rawVolunteerExperience.title), company: utils_1.getCleanText(rawVolunteerExperience.company), description: utils_1.getCleanText(rawVolunteerExperience.description), startDate,
                        endDate, durationInDays: utils_1.getDurationInDays(startDate, endDate) });
                });
                utils_1.statusLog(logSection, `Got volunteer experience data: ${JSON.stringify(volunteerExperiences)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing skills data...`, scraperSessionId);
                const skills = yield page.$$eval('.pv-skill-categories-section ol > .ember-view', nodes => {
                    return nodes.map((node) => {
                        var _a, _b;
                        const skillName = node.querySelector('.pv-skill-category-entity__name-text');
                        const endorsementCount = node.querySelector('.pv-skill-category-entity__endorsement-count');
                        return {
                            skillName: (skillName) ? (_a = skillName.textContent) === null || _a === void 0 ? void 0 : _a.trim() : null,
                            endorsementCount: (endorsementCount) ? parseInt(((_b = endorsementCount.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '0') : 0
                        };
                    });
                });
                utils_1.statusLog(logSection, `Got skills data: ${JSON.stringify(skills)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing organization accomplishments data...`, scraperSessionId);
                const orgAccButton = 'button[aria-label="Expand organizations section"][aria-expanded="false"]';
                if (yield page.$(orgAccButton)) {
                    yield page.click(orgAccButton);
                    yield page.waitFor(100);
                }
                const rawOrganizationAccomplishments = yield page.$$eval('.pv-profile-section.pv-accomplishments-block.organizations ul > li.ember-view', (nodes) => {
                    var _a, _b, _c, _d, _e;
                    const data = [];
                    for (const node of nodes) {
                        const nameElement = node.querySelector('.pv-accomplishment-entity__title');
                        const name = (nameElement === null || nameElement === void 0 ? void 0 : nameElement.textContent) || null;
                        const positionElement = node.querySelector('.pv-accomplishment-entity__position');
                        const position = (positionElement === null || positionElement === void 0 ? void 0 : positionElement.textContent) || null;
                        const dateRangeElement = node.querySelector('.pv-accomplishment-entity__date');
                        const dateRange = ((_a = dateRangeElement === null || dateRangeElement === void 0 ? void 0 : dateRangeElement.textContent) === null || _a === void 0 ? void 0 : _a.replace(/\s*\n\s*/gm, '')) || null;
                        const startDate = ((_c = (_b = dateRange === null || dateRange === void 0 ? void 0 : dateRange.split(/-|–/)) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.trim()) || null;
                        const endDate = ((_e = (_d = dateRange === null || dateRange === void 0 ? void 0 : dateRange.split(/-|–/)) === null || _d === void 0 ? void 0 : _d[1]) === null || _e === void 0 ? void 0 : _e.trim()) || null;
                        const endDateIsPresent = (endDate === null || endDate === void 0 ? void 0 : endDate.toLowerCase()) === "present" || false;
                        const descriptionElement = node.querySelector('.pv-accomplishment-entity__description');
                        const description = (descriptionElement === null || descriptionElement === void 0 ? void 0 : descriptionElement.textContent) || null;
                        data.push({
                            name: name,
                            position: position,
                            startDate: startDate,
                            endDate: endDate,
                            endDateIsPresent: endDateIsPresent,
                            description: description
                        });
                    }
                    return data;
                });
                const organizationAccomplishments = rawOrganizationAccomplishments.map(rawOrganizationAccomplishment => {
                    const startDate = utils_1.formatDate(utils_1.getCleanText(rawOrganizationAccomplishment.startDate));
                    const endDate = utils_1.formatDate(utils_1.getCleanText(rawOrganizationAccomplishment.endDate));
                    return Object.assign(Object.assign({}, rawOrganizationAccomplishment), { name: utils_1.getCleanText(rawOrganizationAccomplishment.name), position: utils_1.getCleanText(rawOrganizationAccomplishment.position), description: utils_1.getCleanText(rawOrganizationAccomplishment.description), startDate: startDate, endDate: endDate, durationInDays: utils_1.getDurationInDays(startDate, endDate) });
                });
                utils_1.statusLog(logSection, `Parsing language accomplishments data...`, scraperSessionId);
                const langAccButton = 'button[aria-label="Expand languages section"][aria-expanded="false"]';
                if (yield page.$(langAccButton)) {
                    yield page.click(langAccButton);
                    yield page.waitFor(100);
                }
                const rawLanguageAccomplishments = yield page.$$eval('.pv-profile-section.pv-accomplishments-block.languages ul > li.ember-view', (nodes) => {
                    const data = [];
                    for (const node of nodes) {
                        const languageElement = node.querySelector('.pv-accomplishment-entity__title');
                        const language = (languageElement === null || languageElement === void 0 ? void 0 : languageElement.textContent) || null;
                        const proficiencyElement = node.querySelector('.pv-accomplishment-entity__proficiency');
                        const proficiency = (proficiencyElement === null || proficiencyElement === void 0 ? void 0 : proficiencyElement.textContent) || null;
                        data.push({
                            language: language,
                            proficiency: proficiency
                        });
                    }
                    return data;
                });
                const languageAccomplishments = rawLanguageAccomplishments.map(languageAccomplishment => {
                    return Object.assign(Object.assign({}, languageAccomplishment), { language: utils_1.getCleanText(languageAccomplishment.language), proficiency: utils_1.getCleanText(languageAccomplishment.proficiency) });
                });
                utils_1.statusLog(logSection, `Parsing project accomplishments data...`, scraperSessionId);
                const projAccButton = 'button[aria-label="Expand projects section"][aria-expanded="false"]';
                if (yield page.$(projAccButton)) {
                    yield page.click(projAccButton);
                    yield page.waitFor(100);
                }
                const rawProjectAccomplishments = yield page.$$eval('.pv-profile-section.pv-accomplishments-block.projects ul > li.ember-view', (nodes) => {
                    const data = [];
                    for (const node of nodes) {
                        const nameElement = node.querySelector('.pv-accomplishment-entity__title');
                        const name = (nameElement === null || nameElement === void 0 ? void 0 : nameElement.textContent) || null;
                        const descriptionElement = node.querySelector('.pv-accomplishment-entity__description');
                        const description = (descriptionElement === null || descriptionElement === void 0 ? void 0 : descriptionElement.textContent) || null;
                        data.push({
                            name: name,
                            description: description
                        });
                    }
                    return data;
                });
                const projectAccomplishments = rawProjectAccomplishments.map(projectAccomplishment => {
                    return Object.assign(Object.assign({}, projectAccomplishment), { name: utils_1.getCleanText(projectAccomplishment.name), description: utils_1.getCleanText(projectAccomplishment.description) });
                });
                utils_1.statusLog(logSection, `Done! Returned profile details for: ${profileUrl}`, scraperSessionId);
                if (!this.options.keepAlive) {
                    utils_1.statusLog(logSection, 'Not keeping the session alive.');
                    yield this.close(page);
                    utils_1.statusLog(logSection, 'Done. Puppeteer is closed.');
                }
                else {
                    utils_1.statusLog(logSection, 'Done. Puppeteer is being kept alive in memory.');
                    yield page.close();
                }
                return {
                    userProfile,
                    experiences,
                    certifications,
                    education,
                    volunteerExperiences,
                    skills,
                    organizationAccomplishments,
                    languageAccomplishments,
                    projectAccomplishments
                };
            }
            catch (err) {
                yield this.close();
                utils_1.statusLog(logSection, 'An error occurred during a run.');
                throw err;
            }
        });
        const logSection = 'constructing';
        const errorPrefix = 'Error during setup.';
        if (!userDefinedOptions.sessionCookieValue) {
            throw new Error(`${errorPrefix} Option "sessionCookieValue" is required.`);
        }
        if (userDefinedOptions.sessionCookieValue && typeof userDefinedOptions.sessionCookieValue !== 'string') {
            throw new Error(`${errorPrefix} Option "sessionCookieValue" needs to be a string.`);
        }
        if (userDefinedOptions.userAgent && typeof userDefinedOptions.userAgent !== 'string') {
            throw new Error(`${errorPrefix} Option "userAgent" needs to be a string.`);
        }
        if (userDefinedOptions.keepAlive !== undefined && typeof userDefinedOptions.keepAlive !== 'boolean') {
            throw new Error(`${errorPrefix} Option "keepAlive" needs to be a boolean.`);
        }
        if (userDefinedOptions.timeout !== undefined && typeof userDefinedOptions.timeout !== 'number') {
            throw new Error(`${errorPrefix} Option "timeout" needs to be a number.`);
        }
        if (userDefinedOptions.headless !== undefined && typeof userDefinedOptions.headless !== 'boolean') {
            throw new Error(`${errorPrefix} Option "headless" needs to be a boolean.`);
        }
        this.options = Object.assign(this.options, userDefinedOptions);
        utils_1.statusLog(logSection, `Using options: ${JSON.stringify(this.options)}`);
    }
}
exports.LinkedInProfileScraper = LinkedInProfileScraper;
//# sourceMappingURL=index.js.map