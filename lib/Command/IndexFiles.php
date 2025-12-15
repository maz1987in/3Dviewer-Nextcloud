<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Command;

use OCA\ThreeDViewer\Service\FileIndexService;
use OCP\IUserManager;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

class IndexFiles extends Command
{
    public function __construct(
        private readonly FileIndexService $fileIndexService,
        private readonly IUserManager $userManager,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->setName('threedviewer:index-files')
            ->setDescription('Index all existing 3D files for a user or all users')
            ->addArgument('user', InputArgument::OPTIONAL, 'User ID to index files for (optional, if omitted indexes all users)');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $userId = $input->getArgument('user');

        if ($userId) {
            // Index for specific user
            if (!$this->userManager->userExists($userId)) {
                $output->writeln("<error>User '$userId' does not exist</error>");

                return Command::FAILURE;
            }

            $output->writeln("Indexing 3D files for user: $userId");
            $this->fileIndexService->reindexUser($userId);
            $output->writeln("<info>Indexing completed for user: $userId</info>");
        } else {
            // Index for all users
            $output->writeln('Indexing 3D files for all users...');
            $userCount = 0;

            $this->userManager->callForAllUsers(function ($user) use (&$userCount, $output) {
                $userId = $user->getUID();
                $output->writeln("Indexing files for user: $userId");
                $this->fileIndexService->reindexUser($userId);
                $userCount++;
            });

            $output->writeln("<info>Indexing completed for $userCount users</info>");
        }

        return Command::SUCCESS;
    }
}
