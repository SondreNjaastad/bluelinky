// install this
// npm install @google/maps

const bluelinkConfig = require('../../config.json');
const config = require('./config.json');
const BlueLinky = require('../../dist/index');
const GoogleMaps = require('@google/maps');

const googleMapsClient = GoogleMaps.createClient({
	key: config.apiKey,
	Promise: Promise
});

const authCreds = {
	username: bluelinkConfig.username,
	password: bluelinkConfig.password
}

const main = async () => {
	const client = new BlueLinky(authCreds);

	// do login
	const auth = await client.login();
	
	// we register and wait for a vehicle to get its features
	const vehicle = await client.registerVehicle(bluelinkConfig.vin, bluelinkConfig.pin);

	// call the status method
	try {
		const respone = await googleMapsClient.findPlace({
			input: process.argv[2],
			inputtype: 'textquery',
			fields: [
				'geometry/location',
				'formatted_address',
				'place_id',
			]
		}).asPromise();
		
		const firstResult = respone.json.candidates[0];
		const { lat, lng } = firstResult.geometry.location
		const address = firstResult.formatted_address;
		const placeId = firstResult.place_id;
		const status = await vehicle.sendPointOfInterest({
			address,
			placeId,
			location: {
				lat,
				long: lng
			}
		});
		console.log(status);
	} catch (err) {
		console.log(err);
	} 
}

main();
