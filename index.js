//const chalk = require('chalk');
const kleur = require('kleur');
const table = require('text-table');
const hooker = require('hooker');
const dateTime = require('date-time');
const prettyMs = require('pretty-ms');
const barChar = require('figures').square;

const argv = process.argv.slice(2);
const write = process.stdout.write.bind(process.stdout);

const log = function (str) {
	write(`${str}\n`, 'utf8');
}

module.exports = (grunt, cb) => {
	const now = new Date();
	const startTimePretty = dateTime(new Date(), {local: true});
	const startTime = now.getTime();
	let prevTime = startTime;
	let prevTaskName = 'loading tasks';
	const tableData = [];

	if (argv.includes('--help') ||
		argv.includes('-h') ||
		argv.includes('--quiet') ||
		argv.includes('-q') ||
		argv.includes('--version') ||
		argv.includes('-V')) {
		return;
	}

	kleur.enabled = !argv.includes('--no-color');

	// Crazy hack to work around stupid node-exit
	// Can this be removed now that node-exit#4 has been resolved?
	// https://github.com/cowboy/node-exit/issues/4
	const originalExit = process.exit;

	let exit = exitCode => {
		clearInterval(interval);
		process.emit('timegruntexit', exitCode);
		exit = () => {};
	};

	const interval = setInterval(() => {
		process.exit = exit;
	}, 100);

	process.exit = exit;

	hooker.hook(grunt.log, 'header', () => {
		const name = grunt.task.current.nameArgs;
		const diff = Date.now() - prevTime;

		if (prevTaskName && prevTaskName !== name) {
			tableData.push([prevTaskName, diff]);
		}

		prevTime = Date.now();
		prevTaskName = name;
	});

	const formatTable = function (tableData) {
		const totalTime = Date.now() - startTime;
		const longestTaskName = tableData.reduce((acc, row) => {
			const avg = row[1] / totalTime;

			if (!grunt.option('verbose')) {
				return acc;
			}

			return Math.max(acc, row[0].length);
		}, 0);

		const maxColumns = process.stdout.columns || 80;
		let maxBarWidth;

		if (longestTaskName > maxColumns / 2) {
			maxBarWidth = (maxColumns - 20) / 2;
		} else {
			maxBarWidth = maxColumns - (longestTaskName + 20);
		}
		maxBarWidth = Math.max(0, maxBarWidth);

		const shorten = function (taskName) {
			const nameLength = taskName.length;

			if (nameLength <= maxBarWidth) {
				return taskName;
			}

			const partLength = Math.floor((maxBarWidth - 3) / 2);
			const start = taskName.substr(0, partLength + 1);
			const end = taskName.substr(nameLength - partLength);

			return `${start.trim()}...${end.trim()}`;
		}

		const createBar = function (percentage) {
			const rounded = Math.round(percentage * 100);

			if (rounded === 0) {
				return '0%';
			}

			const barLength = Math.ceil(maxBarWidth * percentage) + 1;
			const bar = new Array(barLength).join(barChar);

			return `${bar} ${rounded}%`;
		}

		const tableDataProcessed = tableData.map(row => {
			const avg = row[1] / totalTime;

			// Hide the watch task
			if (!grunt.option('verbose') && /^watch($|:)/.test(row[0])) {
				return null;
			}

			if (isNaN(avg) || (avg < 0.01 && !grunt.option('verbose'))) {
				return null;
			}

			return [shorten(row[0]), kleur.yellow(prettyMs(row[1])), kleur.yellow(createBar(avg))];
		}).reduce((acc, row) => {
			if (row) {
				acc.push(row);
				return acc;
			}

			return acc;
		}, []);

		tableDataProcessed.push([kleur.bold().green(`Total ${prettyMs(totalTime)}`)]);

		return table(tableDataProcessed, {
			align: ['l', 'r', 'l'],
			stringLength(str) {
				return str.length;
			}
		});
	}

	process.on('SIGINT', () => {
		process.exit();
	});

	process.once('timegruntexit', exitCode => {
		clearInterval(interval);

		process.exit = originalExit;
		hooker.unhook(grunt.log, 'header');

		const diff = Date.now() - prevTime;

		if (prevTaskName) {
			tableData.push([prevTaskName, diff]);
		}

		// `grunt.log.header` should be unhooked above, but in some cases it's not
		log(`\n\n${kleur.underline('Execution Time')}${kleur.magenta(` (${startTimePretty})`)}`);
		log(`${formatTable(tableData)}\n`);

		if (cb) {
			cb(tableData, () => {
				process.exit(exitCode);
			});

			return;
		}

		process.exit(exitCode);
	});
};
