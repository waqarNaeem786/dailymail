const { exec, execSync } = require('child_process');
const fs = require('fs');
const pm2 = require('pm2');
const nodemailer = require('nodemailer');
const os = require('os');
const cron = require('node-cron');
const util = require('util');
require('dotenv').config()
// Function to retrieve system information
function getSystemInfo() {
    const systemInfo = {
        hostname: os.hostname(),
        ipAddress: getIpAddress(),
        osType: os.type(),
        osPlatform: os.platform(),
        osRelease: os.release(),
        kernelName: getKernelName(),
        username: os.userInfo().username
    };

    return systemInfo;
}

// Function to get the primary IP address of the system
function getIpAddress() {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const iface = networkInterfaces[interfaceName];
        for (let i = 0; i < iface.length; i++) {
            const { address, family, internal } = iface[i];
            if (family === 'IPv4' && !internal) {
                return address;
            }
        }
    }
    return 'N/A';
}

// Function to get the kernel name
function getKernelName() {
    return execSync('uname -s').toString().trim();
}

// Function to check VPS health metrics
function getVpsHealth() {
    const totalMemory = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2); // Total memory in GB
    const freeMemory = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2); // Free memory in GB
    const cpuUsage = os.loadavg()[0]; // CPU usage (1-minute load average)

    const vpsHealth = {
        totalMemory,
        freeMemory,
        cpuUsage
        // Add more metrics as needed (disk space, network usage, etc.)
    };

    return vpsHealth;
}

async function getAllPM2ProcessesInfo() {
    return new Promise((resolve, reject) => {
        pm2.list((err, processes) => {
            if (err) {
                console.error(`Error listing PM2 processes: ${err}`);
                reject(err);
            } else {
                const processesInfo = processes.map(process => ({
                    name: process.name,
                    memory: (process.monit.memory / (1024 * 1024)).toFixed(2), // Memory in MB
                    cpu: process.monit.cpu.toFixed(2) // CPU usage in percentage
                }));
                resolve(processesInfo);
            }
        });
    });
}



async function getLastLinesFromSystemdLog(serviceName, numLines) {
    return new Promise((resolve, reject) => {
        exec(`sudo journalctl -u ${serviceName} --no-pager | tail -n ${numLines}`, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else if (stderr) {
                reject(new Error(stderr));
            } else {
                resolve(stdout);
            }
        });
    });
}

async function getCronJobsStatus() {
    try {
        const { stdout, stderr } = await util.promisify(exec)('crontab -l');

        if (stderr) {
            throw new Error(`Error listing cron jobs: ${stderr}`);
        }

        const cronJobPatterns = [
            '/var/www/updateQuotes',
            '/var/www/stopQuotes',
            '/var/www/updateScreener',
            '/var/www/stopScreener',
            '/var/www/updateChartsImages',
            '/var/www/stopChartsImages',
            '/var/www/updateCharts',
            '/var/www/stopCharts',
            '/var/www/updateAnalysts',
            '/var/www/stopAnalysts',
            '/var/www/updateBreakdown',
            '/var/www/stopBreakdown',
            '/var/www/updateCalendars',
            '/var/www/stopCalendars',
            '/var/www/updateCompaniesProfiles',
            '/var/www/stopCompaniesProfiles',
            '/var/www/updateEconomicCalendar',
            '/var/www/stopEconomicCalendar',
            '/var/www/updateEstimates',
            '/var/www/stopEstimates',
            '/var/www/updateEtfs',
            '/var/www/stopEtfs',
            '/var/www/updateIndustries',
            '/var/www/stopIndustries',
            '/var/www/updateInvestors',
            '/var/www/stopInvestors',
            '/var/www/updateLists',
            '/var/www/stopLists',
            '/var/www/updateMacroeconomicMetrics',
            '/var/www/stopMacroeconomicMetrics',
            '/var/www/updateMovers',
            '/var/www/stopMovers',
            '/var/www/updateNews',
            '/var/www/stopNews',
            '/var/www/updateOperations',
            '/var/www/stopOperations',
            '/var/www/updateOverlayingCharts',
            '/var/www/stopOverlayingCharts',
            '/var/www/updateRatings',
            '/var/www/stopRatings',
            '/var/www/updateRatios',
            '/var/www/stopRatios',
            '/var/www/updateReports',
            '/var/www/stopReports',
            '/var/www/stopSentiment',
            '/var/www/updateSentiment',
            '/var/www/updateHealth',
            '/var/www/deleteHealth',
            '/var/www/sendBreakoutsEmails',
            '/var/www/stopBreakoutsEmails',
            '/var/www/restartCrypto',
            '/var/www/cleanCache'
            // Add more patterns as needed
        ];

        const activeCronJobs = cronJobPatterns.filter(pattern => stdout.includes(pattern));
        return activeCronJobs;
    } catch (error) {
        console.error('Error checking cron jobs status:', error);
        throw error;
    }
}

async function generateHtmlReport(processesInfo, vpsHealth, cronJobsActive, systemInfo, reportTime, chartImagesServiceLogs, setupsEmailsServiceLogs) {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>System Health Report</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background-color: #f0f0f0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            background-color: #ffffff;
        }
        th, td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f2f2f2;
            color: #333;
            text-align: center; /* Align headings in center */
        }
        .section-header {
            font-size: 24px;
            margin-bottom: 10px;
            color: #333;
        }
        .section-content {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
        }
        .vps-health, .process-info, .cron-info, .service-logs {
            flex-basis: 100%;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            background-color: #f9f9f9;
        }
        .vps-health th, .process-info th, .cron-info th, .service-logs th {
            background-color: #e6f7ff;
            color: #333;
            text-align: center; /* Align headings in center */
        }
        .vps-health td, .process-info td, .cron-info td, .service-logs td {
            border-bottom: none;
        }
    </style>
</head>
<body>
    <table>
        <tr>
            <th colspan="2">System Health Report</th>
        </tr>
        <tr>
            <td colspan="2">Report Time: ${reportTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', timeZone: 'America/New_York' })} EST</td>
        </tr>
        <tr>
            <th colspan="2" class="section-header">System Information</th>
        </tr>
        <tr>
            <td><strong>Hostname:</strong></td>
            <td>${systemInfo.hostname}</td>
        </tr>
        <tr>
            <td><strong>IP Address:</strong></td>
            <td>${systemInfo.ipAddress}</td>
        </tr>
        <tr>
            <td><strong>OS Type:</strong></td>
            <td>${systemInfo.osType}</td>
        </tr>
        <tr>
            <td><strong>OS Platform:</strong></td>
            <td>${systemInfo.osPlatform}</td>
        </tr>
        <tr>
            <td><strong>OS Release:</strong></td>
            <td>${systemInfo.osRelease}</td>
        </tr>
        <tr>
            <td><strong>Kernel Name:</strong></td>
            <td>${systemInfo.kernelName}</td>
        </tr>
        <tr>
            <td><strong>Username:</strong></td>
            <td>${systemInfo.username}</td>
        </tr>
        <tr>
            <th colspan="2" class="section-header">VPS Health Metrics</th>
        </tr>
        <tr>
            <td colspan="2">
                <table class="vps-health">
                    <tr>
                        <th>Total Memory</th>
                        <td>${vpsHealth.totalMemory} GB</td>
                    </tr>
                    <tr>
                        <th>Free Memory</th>
                        <td>${vpsHealth.freeMemory} GB</td>
                    </tr>
                    <tr>
                        <th>CPU Usage (1-min Load Average)</th>
                        <td>${vpsHealth.cpuUsage}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <th colspan="2" class="section-header">PM2 Processes Health</th>
        </tr>
        <tr>
            <td colspan="2">
                <table class="process-info">
                    ${processesInfo.map(info => `
                        <tr>
                            <th>${info.name}</th>
                            <td>
                                <strong>Memory Usage:</strong> ${info.memory} MB<br>
                                <strong>CPU Usage:</strong> ${info.cpu} %
                            </td>
                        </tr>
                    `).join('\n')}
                </table>
            </td>
        </tr>
       <tr>
            <th colspan="2">Cron Jobs Status</th>
        </tr>
        <tr>
            <td colspan="2" class="cron-info"><strong>Active Cron Jobs:</strong> ${cronJobsActive ? 'Running' : 'Not Running'}</td>
        </tr>
        <tr>
            <th colspan="2">Path of Running Cron Jobs</th>
        </tr>
        ${cronJobsActive ? cronJobsActive.map(path => `
            <tr>
                <td colspan="2">${path}</td>
            </tr>
        `).join('\n') : '<tr><td colspan="2">No active cron jobs found</td></tr>'}

    <tr>
        <th colspan="2">Chart Images Service Logs</th>
    </tr>
    <tr>
        <td colspan="2" class="service-logs"><pre>${chartImagesServiceLogs}</pre></td>
    </tr>
    <tr>
        <th colspan="2">Setups Emails Service Logs</th>
    </tr>
    <tr>
        <td colspan="2" class="service-logs"><pre>${setupsEmailsServiceLogs}</pre></td>
    </tr>
    </table>
</body>
</html>


        `;

    return htmlContent;
}

async function sendEmail(htmlContent, reportTime) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.USER,
            pass: process.env.PASSWORD // Use App Password for Gmail
        }
    });

    const mailOptions = {
        from: process.env.USER,
        to: process.env.TO,
        subject: `VPS Health Report ${reportTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', timeZone: 'America/New_York' })} EST`,
        html: htmlContent
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(`Error sending email: ${error}`);
        } else {
            console.log(`Email sent: ${info.response}`);
        }
    });
}

async function main() {
    try {
        const systemInfo = getSystemInfo();
        console.log('Fetching PM2 processes...');
        const processesInfo = await getAllPM2ProcessesInfo();

        console.log('Checking VPS health...');
        const vpsHealth = getVpsHealth();

        console.log('Checking cron jobs status...');
        const cronJobsActive = await getCronJobsStatus();

        console.log('Reading logs from systemd service files...');
        const [chartImagesServiceLogs, setupsEmailsServiceLogs] = await Promise.all([
            getLastLinesFromSystemdLog('Chart-images.service', 30),
            getLastLinesFromSystemdLog('Setups-emails.service', 30)
        ]);

        const reportTime = new Date();
        const htmlContent = await generateHtmlReport(processesInfo, vpsHealth, cronJobsActive, systemInfo, reportTime, chartImagesServiceLogs, setupsEmailsServiceLogs);
        sendEmail(htmlContent, reportTime);
    } catch (error) {
        console.error(`Error in main function: ${error}`);
    }
}

main();

