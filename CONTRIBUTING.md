# 参与开发

使用 Node.js 22.18+（22.x）与 npm，先阅读 [README](README.md) 和 [架构说明](docs/ARCHITECTURE.md)。

```sh
npm ci
npm run dev
```

默认本机演示无须云账号。测试只用虚构数据；不要把 `.data`、环境文件、真实名单或凭据放进提交。

提交修改前运行 `npm test`、`npm run test:cloudbase`、`npm run build` 和 `npm run typecheck`。事务变更还需 Docker 下运行 `npm run test:postgres`；HTTP 验证先启动 3011 账号服务，再运行 `npm run test:http`。

请在变更说明中写明触发条件、修改后的行为和验证方法。新增角色或权限时必须覆盖越权拒绝；不要用演示身份替代真实认证，也不要悄悄放宽授权检查。

CI 只使用虚构数据和占位环境 ID，不需要云密钥，不会部署网站。外部 Pull Request 不应获得任何生产凭证。
