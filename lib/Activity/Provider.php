<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Activity;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteLinks;
use OCP\Activity\Exceptions\UnknownActivityException;
use OCP\Activity\IEvent;
use OCP\Activity\IProvider;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;

/**
 * Writes the app's Activity events out in the reader's language, with the person and the
 * file as rich objects so the stream links them.
 *
 * An event stores who did what and to which file, never wording and never the note: the
 * sentence is built here, at read time, so a translation applies to old events too, and a
 * note's text can't end up in a stream or an email.
 *
 * @psalm-suppress UnusedClass Registered via info.xml at runtime.
 */
class Provider implements IProvider
{
    public const NOTE_ADDED = 'note_added';
    public const NOTE_CHANGED = 'note_changed';
    public const NOTE_DELETED = 'note_deleted';

    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IFactory $l10n,
        private readonly IURLGenerator $urls,
        private readonly IUserManager $users,
        private readonly NoteLinks $links,
    ) {
    }

    /**
     * @param string $language
     * @throws UnknownActivityException
     */
    public function parse($language, IEvent $event, ?IEvent $previousEvent = null): IEvent
    {
        if ($event->getApp() !== Application::APP_ID || $event->getType() !== Setting::TYPE) {
            throw new UnknownActivityException();
        }
        $subject = $event->getSubject();
        if (!in_array($subject, [self::NOTE_ADDED, self::NOTE_CHANGED, self::NOTE_DELETED], true)) {
            throw new UnknownActivityException();
        }

        $l = $this->l10n->get(Application::APP_ID, $language);
        $parameters = $event->getSubjectParameters();
        $actor = NoteActor::fromParameters($parameters['actorKind'] ?? null, $parameters['actor'] ?? null);
        $path = ltrim(isset($parameters['path']) && is_string($parameters['path']) ? $parameters['path'] : $event->getObjectName(), '/');
        $fileId = (string) ($parameters['fileId'] ?? $event->getObjectId());

        $variant = $this->variant($actor, $event->getAffectedUser());
        $sentence = $this->sentence($l, $subject, $variant);

        $rich = [
            'file' => [
                'type' => 'file',
                'id' => $fileId,
                'name' => basename($path),
                'path' => $path,
                'link' => $this->links->forFile((int) $fileId),
            ],
        ];
        $plain = ['file' => $path];
        if ($variant === 'user') {
            $rich['user'] = ['type' => 'user', 'id' => $actor->value, 'name' => $this->users->getDisplayName($actor->value) ?? $actor->value];
            $plain['user'] = $rich['user']['name'];
        } elseif ($variant === 'guest') {
            // Not a user object: a visitor's name is theirs to type, and must not link to or pass for an account
            $rich['guest'] = ['type' => 'highlight', 'id' => 'guest:' . substr(sha1($actor->value), 0, 16), 'name' => $actor->value];
            $plain['guest'] = $actor->value;
        }

        $event->setRichSubject($sentence, $rich);
        $event->setParsedSubject($this->plain($sentence, $plain));
        $event->setIcon($this->urls->getAbsoluteURL($this->urls->imagePath(Application::APP_ID, 'app-dark.svg')));

        return $event;
    }

    /** What the sentence names as the doer: the reader themselves, another user, a named guest or no one in particular */
    private function variant(NoteActor $actor, string $reader): string
    {
        return match (true) {
            $actor->isUser() && $actor->value === $reader => 'self',
            $actor->isUser() => 'user',
            $actor->kind === NoteActor::GUEST => 'guest',
            default => 'anonymous',
        };
    }

    /**
     * Each sentence is a literal `t()` call so the strings can be found for translation.
     */
    private function sentence(IL10N $l, string $subject, string $variant): string
    {
        return match ([$subject, $variant]) {
            [self::NOTE_ADDED, 'self'] => $l->t('You added a note on {file}'),
            [self::NOTE_ADDED, 'user'] => $l->t('{user} added a note on {file}'),
            [self::NOTE_ADDED, 'guest'] => $l->t('{guest} (guest) added a note on {file}'),
            [self::NOTE_ADDED, 'anonymous'] => $l->t('A visitor with the link added a note on {file}'),
            [self::NOTE_CHANGED, 'self'] => $l->t('You changed a note on {file}'),
            [self::NOTE_CHANGED, 'user'] => $l->t('{user} changed a note on {file}'),
            [self::NOTE_CHANGED, 'guest'] => $l->t('{guest} (guest) changed a note on {file}'),
            [self::NOTE_CHANGED, 'anonymous'] => $l->t('A visitor with the link changed a note on {file}'),
            [self::NOTE_DELETED, 'self'] => $l->t('You deleted a note on {file}'),
            [self::NOTE_DELETED, 'user'] => $l->t('{user} deleted a note on {file}'),
            [self::NOTE_DELETED, 'guest'] => $l->t('{guest} (guest) deleted a note on {file}'),
            default => $l->t('A visitor with the link deleted a note on {file}'),
        };
    }

    /**
     * @param array<string, string> $values placeholder => text
     */
    private function plain(string $sentence, array $values): string
    {
        $replace = [];
        foreach ($values as $placeholder => $text) {
            $replace['{' . $placeholder . '}'] = $text;
        }

        return strtr($sentence, $replace);
    }
}
