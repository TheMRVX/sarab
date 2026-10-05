use anyhow::Result;

#[cfg(windows)]
pub fn read_windows_location() -> Result<()> {
    use windows::Devices::Geolocation::Geolocator;

    println!("[*] Querying Windows Location Service (Windows.Devices.Geolocation)...");

    let geolocator = Geolocator::new()
        .map_err(|e| anyhow::anyhow!("Failed to instantiate Geolocator: {:?}", e))?;

    let status = geolocator.LocationStatus()
        .map_err(|e| anyhow::anyhow!("Failed to query LocationStatus: {:?}", e))?;

    println!("[*] Location Status: {:?}", status);

    let async_op = geolocator.GetGeopositionAsync()
        .map_err(|e| anyhow::anyhow!("GetGeopositionAsync failed (check if Location Services are ON in Windows Settings): {:?}", e))?;

    let position = async_op.get()
        .map_err(|e| anyhow::anyhow!("Failed to retrieve Geoposition: {:?}", e))?;

    let coordinate = position.Coordinate()
        .map_err(|e| anyhow::anyhow!("Failed to retrieve Coordinate: {:?}", e))?;

    let point = coordinate.Point()
        .map_err(|e| anyhow::anyhow!("Failed to retrieve Point: {:?}", e))?;

    let pos = point.Position()
        .map_err(|e| anyhow::anyhow!("Failed to retrieve BasicGeoposition: {:?}", e))?;

    let accuracy = coordinate.Accuracy().unwrap_or(0.0);

    println!("\n=== Windows Live Location Report ===");
    println!("Latitude:   {:.7}°", pos.Latitude);
    println!("Longitude:  {:.7}°", pos.Longitude);
    println!("Altitude:   {:.2} m", pos.Altitude);
    println!("Accuracy:   {:.1} m", accuracy);
    println!("====================================\n");

    Ok(())
}

#[cfg(not(windows))]
pub fn read_windows_location() -> Result<()> {
    println!("[*] Simulated Location: Lat: 35.6997000°, Lon: 51.3380000°, Alt: 1200.00 m, Acc: 5.0 m");
    Ok(())
}
