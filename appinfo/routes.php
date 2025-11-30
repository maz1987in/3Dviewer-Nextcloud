<?php

return [
	'routes' => [
		['name' => 'settings#get_settings', 'url' => '/settings', 'verb' => 'GET'],
		['name' => 'settings#save_settings', 'url' => '/settings', 'verb' => 'PUT'],
		['name' => 'settings#reset_settings', 'url' => '/settings', 'verb' => 'DELETE'],
	],
];
