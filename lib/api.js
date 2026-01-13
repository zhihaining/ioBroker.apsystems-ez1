const axios = require("axios");
const axiosRetry = require("axios-retry");

/**
 * function for creating client of apsystems ez1 device
 *
 * @param ip.ip the ip address
 * @param ip.port the port of device rest api service
 * @param ip.timeout the timeout of connection
 * @param ip.retries the number of reties of failed connection
 * @param root0
 * @param root0.ip
 * @param root0.port
 * @param root0.timeout
 * @param root0.retries
 */
function createClient({ ip, port = 8050, timeout = 5000, retries = 2 }) {
    const baseURL = `http://${ip}:${port}`;
    const client = axios.create({ baseURL, timeout });

    axiosRetry(client, {
        retries: retries,
        retryDelay: axiosRetry.exponentialDelay,
        retryCondition: error => {
            return (
                axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response && error.response.status >= 500)
            );
        },
    });

    async function get(path) {
        const res = await client.get(path);
        return res.data;
    }

    return { get };
}

module.exports = { createClient };
