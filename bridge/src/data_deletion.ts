/**
 * When executed, this file scans the entire `messages` database collection
 * and deletes entries belonging to channels which do no longer have a bridge
 * configuration associated. Reads mongo URI from $DB_STRING env var.
 */

import Mongo from 'mongodb';

if (!process.env.DB_STRING) {
    console.error('$DB_STRING not provided.');
    process.exit(1);
}

const mongo = new Mongo.MongoClient(process.env.DB_STRING);

(async () => {
    await mongo.connect();
    const client = mongo.db();
    const messages = client.collection('bridged_messages');

    const res = messages.aggregate([{
        $lookup: {
            from: 'bridge_config',
            localField: 'channels.discord',
            foreignField: 'discord',
            as: 'bridgeConfig',
        }
    }]);

    let buf: string[] = [];

    const execute = async () => {
        const ids = [ ...buf ];
        buf.length = 0;

        if (ids.length) {
            console.log('Deleting ' + ids.length + ' entries');
            await messages.deleteMany({ _id: { $in: ids } });
        }
    }

    res.on('data', data => {
        if (!data.bridgeConfig?.length) buf.push(data._id);
        if (buf.length >= 500) execute();
    });

    res.on('end', () => {
        execute().then(() => process.exit(0));
    });
})();
