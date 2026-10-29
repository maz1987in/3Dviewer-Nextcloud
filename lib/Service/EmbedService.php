<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\Share\IShare;

/**
 * Which shares may be embedded: while embedding is on, a link share (not an email
 * share) of one supported model, readable, unexpired and without a password. The app
 * never creates one; it only shows those that already exist.
 */
class EmbedService
{
    public function __construct(
        private readonly EmbedOrigins $origins,
        private readonly ShareFileService $shares,
        private readonly ModelFileSupport $support,
    ) {
    }

    public function embeddable(string $token): ?EmbedTarget
    {
        if (!$this->origins->isEnabled()) {
            return null;
        }

        // Readable and unexpired; link or email
        $share = $this->shares->findValidLinkShare($token);
        if ($share === null || $share->getShareType() !== IShare::TYPE_LINK) {
            return null;
        }
        // A frame has nowhere to ask for a password, and must not show a protected model
        $password = $share->getPassword();
        if ($password !== null && $password !== '') {
            return null;
        }

        try {
            $node = $share->getNode();
        } catch (NotFoundException) {
            return null;
        }
        if (!$node instanceof File || !$this->support->isSupported(strtolower($node->getExtension()))) {
            return null;
        }

        return new EmbedTarget($share, $node, $this->allowsDownload($share));
    }

    private function allowsDownload(IShare $share): bool
    {
        if ($share->getHideDownload()) {
            return false;
        }

        return $share->getAttributes()?->getAttribute('permissions', 'download') !== false;
    }
}
