import type {NextConfig} from 'next';
const cloud=process.env.CAMPUS_STATIC==='1';
const config:NextConfig={serverExternalPackages:['@electric-sql/pglite'],devIndicators:false,...(cloud?{output:'export' as const,basePath:'/campus',trailingSlash:true}:{})};
export default config;
