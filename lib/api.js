const axios = require('axios');
const axiosRetry = require('axios-retry');

function createClient({ ip, port = 8050, timeout = 5000, retries = 2 }) {
    const baseURL = `http://${ip}:${port}`;
    const client = axios.create({ baseURL, timeout });

    axiosRetry(client, {
        retries: retries,
        retryDelay: axiosRetry.exponentialDelay,
        retryCondition: (error) => {
            return axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response && error.response.status >= 500);
        }
    });

    async function get(path) {
        const res = await client.get(path);
        return res.data;
    }

    return { get };
}

module.exports = { createClient };
