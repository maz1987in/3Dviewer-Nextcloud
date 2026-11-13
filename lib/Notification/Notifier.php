<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Notification;

use OCA\ThreeDViewer\AppInfo\Application;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteActor;
use OCA\ThreeDViewer\Service\NoteLinks;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use OCP\Notification\AlreadyProcessedException;
use OCP\Notification\INotification;
use OCP\Notification\INotifier;
use OCP\Notification\UnknownNotificationException;

/**
 * Turns the notifications NoteNotificationPublisher stores into what the bell shows.
 *
 * A notification stores who, which file, which note and how many, not wording: the
 * sentence is built here, in the reader's language, with the person and the file as rich
 * objects. The text of the note is not in it, and never was.
 *
 * The file is looked up for the reader every time, not trusted from when the notification
 * was made. A file that was deleted, or that the reader can no longer open, is no longer
 * something to tell them about, so the notification is withdrawn rather than shown; that
 * is also what cleans up after a file that was removed.
 *
 * @psalm-suppress UnusedClass Registered in AppInfo\Application at runtime.
 */
class Notifier implements INotifier
{
    /** @psalm-suppress PossiblyUnusedMethod Constructed by the DI container */
    public function __construct(
        private readonly IFactory $l10n,
        private readonly IURLGenerator $urls,
        private readonly IUserManager $users,
        private readonly NoteAccess $access,
        private readonly NoteLinks $links,
    ) {
    }

    public function getID(): string
    {
        return Application::APP_ID;
    }

    public function getName(): string
    {
        return $this->l10n->get(Application::APP_ID)->t('3D Viewer');
    }

    /**
     * @param string $languageCode
     * @throws UnknownNotificationException
     * @throws AlreadyProcessedException
     */
    public function prepare(INotification $notification, string $languageCode): INotification
    {
        if ($notification->getApp() !== Application::APP_ID) {
            throw new UnknownNotificationException();
        }
        if ($notification->getSubject() !== NoteNotificationPublisher::SUBJECT_NOTE_ADDED) {
            throw new UnknownNotificationException();
        }

        $parameters = $notification->getSubjectParameters();
        $fileId = $parameters['fileId'] ?? null;
        $noteId = $parameters['noteId'] ?? null;
        $count = $parameters['count'] ?? 1;
        if (!is_int($fileId) || !is_int($noteId) || !is_int($count) || $count < 1) {
            // Something this version did not write, and cannot make a sentence of
            throw new AlreadyProcessedException();
        }

        $access = $this->access->forUser($fileId, $notification->getUser());
        if ($access === null) {
            throw new AlreadyProcessedException();
        }

        $l = $this->l10n->get(Application::APP_ID, $languageCode);
        $actor = NoteActor::fromParameters($parameters['actorKind'] ?? null, $parameters['actor'] ?? null);
        $sentence = $this->sentence($l, $actor, $count);

        // The file carries no link of its own. The Notifications app turns the whole line
        // into the notification's link only when no object in it has one, and that link is
        // the one that opens the model at the note; a file link would take the click instead.
        $rich = [
            'file' => [
                'type' => 'file',
                'id' => (string) $fileId,
                'name' => $access->fileName,
                'path' => $access->path !== '' ? $access->path : $access->fileName,
            ],
        ];
        $plain = ['file' => $access->fileName];
        if ($actor->isUser()) {
            $name = $this->users->getDisplayName($actor->value) ?? $actor->value;
            $rich['user'] = ['type' => 'user', 'id' => $actor->value, 'name' => $name];
            $plain['user'] = $name;
        } elseif ($actor->kind === NoteActor::GUEST) {
            // Not a user object: a visitor's name is theirs to type, and must not link to or pass for an account
            $rich['guest'] = ['type' => 'highlight', 'id' => 'guest:' . substr(sha1($actor->value), 0, 16), 'name' => $actor->value];
            $plain['guest'] = $actor->value;
        }

        $notification
            ->setRichSubject($sentence, $rich)
            ->setParsedSubject($this->plain($sentence, $plain))
            ->setLink($this->links->forNote($fileId, $noteId))
            ->setIcon($this->urls->getAbsoluteURL($this->urls->imagePath(Application::APP_ID, 'app-dark.svg')));

        return $notification;
    }

    /**
     * Each sentence is a literal `t()` or `n()` call so the strings can be found for translation.
     */
    private function sentence(IL10N $l, NoteActor $actor, int $count): string
    {
        if ($count === 1) {
            return match ($actor->kind) {
                NoteActor::USER => $l->t('{user} added a note on {file}'),
                NoteActor::GUEST => $l->t('{guest} (guest) added a note on {file}'),
                default => $l->t('A visitor with the link added a note on {file}'),
            };
        }

        return match ($actor->kind) {
            NoteActor::USER => $l->n('{user} added %n note on {file}', '{user} added %n notes on {file}', $count),
            NoteActor::GUEST => $l->n('{guest} (guest) added %n note on {file}', '{guest} (guest) added %n notes on {file}', $count),
            default => $l->n('A visitor with the link added %n note on {file}', 'A visitor with the link added %n notes on {file}', $count),
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
