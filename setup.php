<?php
declare(strict_types=1);

/**
 * 备用安装入口。
 * 某些主机安全规则会拦截 install.php 这个文件名，可改访问 /setup.php。
 * 逻辑与 install.php 完全一致。
 */

require __DIR__ . '/install.php';
