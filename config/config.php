<?php
/**
 * SilverChat 配置样例。复制为 config/config.php 后填写，或运行 install.php 自动生成。
 */
return array(
    'db' => array(
        'host'    => 'localhost',
        'port'    => 3306,
        'name'    => 'silverchat',
        'user'    => 'silverchat',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ),
    'site' => array(
        'name'        => 'SilverChat',
        'url'         => 'http://localhost:8080',
        'force_https' => false,
        'debug'       => false,
        'timezone'    => 'Asia/Shanghai',
    ),
    'secrets' => array(
        // 主密钥文件路径。建议放在 Web 根目录之外；放在根目录内时由 .htaccess 拒绝访问。
        'path' => dirname(__DIR__) . '/secrets/master.key',
    ),
    'kefu' => array(
        // 客服固定账号。密码在安装时设置或随机生成，只写入本文件（不纳入版本控制）。
        'username' => 'kefu',
        'password' => '',
    ),
    'limits' => array(
        'login_fail_max'      => 5,      // 5 分钟内同账号+IP 失败上限
        'login_fail_window'   => 300,
        'register_per_hour'   => 3,      // 同 IP 每小时注册上限
        'message_per_second'  => 5,      // 单用户每秒发消息上限
        'friend_req_per_day'  => 20,     // 单用户每日好友申请上限
        'poll_per_minute'     => 30,     // 单 Token 每分钟轮询上限
        'upload_per_hour'     => 120,
    ),
    'media' => array(
        'max_image' => 5242880,    // 5 MB
        'max_voice' => 10485760,   // 10 MB
        'max_video' => 52428800,   // 50 MB
        'max_file'  => 20971520,   // 20 MB
        'ttl'       => 604800,     // 7 天
    ),
);
