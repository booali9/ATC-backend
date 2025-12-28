const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

router.get('/service-account', (req, res) => {
    try {
        const configPath = path.join(__dirname, '../config/service-account.json');

        if (!fs.existsSync(configPath)) {
            return res.status(404).json({
                success: false,
                message: 'Service account configuration not found'
            });
        }

        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Selectively return fields (Mask private key)
        const responseData = {
            project_id: configData.project_id,
            private_key_id: configData.private_key_id ?
                `${configData.private_key_id.substring(0, 10)}••••••••••••••••••••••••••••••••` :
                'Not available',
            client_email: configData.client_email
        };

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Error fetching service account config:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;
