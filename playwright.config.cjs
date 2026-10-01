const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/e2e',timeout:30000,workers:1,use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:900},trace:'retain-on-failure'},webServer:{command:'node scripts/serve.cjs',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI}});
