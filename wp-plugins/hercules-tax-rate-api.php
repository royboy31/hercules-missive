<?php
/**
 * Plugin Name: Hercules Tax Rate API
 * Description: REST endpoint to fetch WooCommerce tax rates by country for the CRM
 * Version: 1.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function () {
    register_rest_route( 'hercules/v1', '/tax-rate', [
        'methods'             => 'GET',
        'callback'            => 'hercules_get_tax_rate',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route( 'hercules/v1', '/tax-countries', [
        'methods'             => 'GET',
        'callback'            => 'hercules_get_tax_countries',
        'permission_callback' => '__return_true',
    ]);
});

/**
 * GET /wp-json/hercules/v1/tax-rate?country=AT
 *
 * Returns the standard tax rate for a given billing country
 * using WooCommerce's built-in tax lookup.
 */
function hercules_get_tax_rate( WP_REST_Request $request ) {
    $country = strtoupper( trim( $request->get_param( 'country' ) ) );

    if ( empty( $country ) ) {
        return new WP_REST_Response( [ 'error' => 'country parameter required' ], 400 );
    }

    if ( ! class_exists( 'WC_Tax' ) ) {
        return new WP_REST_Response( [ 'error' => 'WooCommerce not active' ], 500 );
    }

    $rates = WC_Tax::find_rates( [
        'country'   => $country,
        'tax_class' => '',
    ] );

    $rate = 0;
    if ( ! empty( $rates ) ) {
        $first = reset( $rates );
        $rate  = floatval( $first['rate'] );
    }

    return new WP_REST_Response( [
        'country' => $country,
        'rate'    => $rate,
    ], 200 );
}

/**
 * GET /wp-json/hercules/v1/tax-countries
 *
 * Returns all countries with configured standard tax rates.
 */
function hercules_get_tax_countries() {
    global $wpdb;

    $rows = $wpdb->get_results(
        "SELECT tax_rate_country AS country, tax_rate AS rate
         FROM {$wpdb->prefix}woocommerce_tax_rates
         WHERE tax_rate_class = ''
         ORDER BY tax_rate_country ASC",
        ARRAY_A
    );

    $countries = [];
    foreach ( $rows as $row ) {
        $countries[] = [
            'code' => $row['country'],
            'rate' => floatval( $row['rate'] ),
        ];
    }

    return new WP_REST_Response( [ 'countries' => $countries ], 200 );
}
