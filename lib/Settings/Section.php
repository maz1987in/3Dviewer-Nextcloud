<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Settings;

use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Settings\IIconSection;

class Section implements IIconSection {
	public function __construct(
		private IURLGenerator $urlGenerator,
		private IL10N $l10n,
	) {
	}

	public function getID(): string {
		return 'threedviewer';
	}

	public function getName(): string {
		return $this->l10n->t('3D Viewer');
	}

	public function getPriority(): int {
		return 50;
	}

	public function getIcon(): string {
		return $this->urlGenerator->imagePath('threedviewer', 'app-dark.svg');
	}
}

