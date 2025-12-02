import unittest
from unittest.mock import Mock, patch

# Import your actual classes (adjust paths as needed)
from services.ImageMatcherService import ImageMatcherService


class TestImageMatcherService(unittest.TestCase):

    def setUp(self):
        """Set up test fixtures before each test method."""
        self.service = ImageMatcherService()
        self.session_id = "test_session_123"
        self.query_images_data = [
            {
                "image_data": b"fake_image_data_1",
                "image_name": "image1.jpg"
            },
            {
                "image_data": b"fake_image_data_2", 
                "image_name": "image2.png"
            }
        ]
        self.candidate_covers = [
            {
                "url": "http://example.com/cover1.jpg",
                "comic_name": "Comic Book One",
                "issue_number": "1",
                "comic_vine_id": 1001,
                "parent_comic_vine_id": 2001
            },
            {
                "url": "http://example.com/cover2.jpg",
                "comic_name": "Comic Book Two",
                "issue_number": "2",
                "comic_vine_id": 1002,
                "parent_comic_vine_id": 2002
            }
        ]
        
        # Mock dependencies
        self.mock_matcher = Mock()
        self.mock_java_reporter = Mock()
        self.mock_matcher_config = Mock()
        self.mock_matcher_config.get_similarity_threshold.return_value = 0.7
        
        # Patch global functions
        patcher_get_matcher = patch('services.ImageMatcherService.get_global_matcher', return_value=self.mock_matcher)
        patcher_get_config = patch('services.ImageMatcherService.get_global_matcher_config', return_value=self.mock_matcher_config)
        patcher_java_reporter = patch('services.ImageMatcherService.JavaProgressReporter', return_value=self.mock_java_reporter)
        patcher_sanitize = patch('services.ImageMatcherService.sanitize_for_json', side_effect=lambda x: x)
        patcher_copy_storage = patch('services.ImageMatcherService.copy_external_image_to_storage', return_value="local_url")
        patcher_save_storage = patch('services.ImageMatcherService.save_image_to_storage', return_value="storage_url")
        patcher_ensure_dir = patch('services.ImageMatcherService.ensure_results_directory', return_value="/tmp/test_results")
        
        self.addCleanup(patcher_get_matcher.stop)
        self.addCleanup(patcher_get_config.stop)
        self.addCleanup(patcher_java_reporter.stop)
        self.addCleanup(patcher_sanitize.stop)
        self.addCleanup(patcher_copy_storage.stop)
        self.addCleanup(patcher_save_storage.stop)
        self.addCleanup(patcher_ensure_dir.stop)
        
        self.mock_get_matcher = patcher_get_matcher.start()
        self.mock_get_config = patcher_get_config.start()
        self.mock_java_reporter_class = patcher_java_reporter.start()
        self.mock_sanitize = patcher_sanitize.start()
        self.mock_copy_storage = patcher_copy_storage.start()
        self.mock_save_storage = patcher_save_storage.start()
        self.mock_ensure_dir = patcher_ensure_dir.start()
        
        # Setup mock matcher behavior
        self.mock_matcher.match.return_value = [
            {
                "similarity": 0.95,
                "url": "http://example.com/cover1.jpg",
                "comic_name": "Comic Book One",
                "issue_number": "1",
                "comic_vine_id": 1001,
                "parent_comic_vine_id": 2001,
                "match_details": {"key": "value"},
                "candidate_features": {"features": [1,2,3]},
                "source_image_index": 0,
                "source_image_name": "image1.jpg"
            }
        ]
        
        self.mock_java_reporter_class.return_value = self.mock_java_reporter
        self.mock_get_matcher.return_value = self.mock_matcher
        self.mock_get_config.return_value = self.mock_matcher_config

    def test_init(self):
        """Test initialization of ImageMatcherService."""
        service = ImageMatcherService()
        self.assertIsNotNone(service.session_lock)
        self.assertEqual(service.sse_sessions, {})
        self.assertEqual(service.progress_data, {})

    def test_safe_progress_callback_with_none(self):
        """Test that safe_progress_callback handles None callbacks gracefully."""
        self.service.safe_progress_callback(None, "item", "message")

    def test_safe_progress_callback_with_valid_callback(self):
        """Test that safe_progress_callback calls the callback properly."""
        callback = Mock()
        self.service.safe_progress_callback(callback, "item", "message")
        callback.assert_called_once_with("item", "message")

    def test_safe_progress_callback_with_exception(self):
        """Test that safe_progress_callback handles callback exceptions gracefully."""
        callback = Mock(side_effect=Exception("Callback error"))
        self.service.safe_progress_callback(callback, "item", "message")
        # Should not raise exception

    @patch('services.ImageMatcherService.logger')
    def test_process_multiple_images_with_centralized_progress_success(self, mock_logger):
        """Test successful processing of multiple images."""
        # Arrange
        expected_results = {
            'results': [
                {
                    'image_name': 'image1.jpg',
                    'image_url': 'storage_url',
                    'api_success': True,
                    'match_success': True,
                    'best_similarity': 0.95,
                    'status_code': 200,
                    'error': None,
                    'matches': [
                        {
                            'similarity': 0.95,
                            'url': 'http://example.com/cover1.jpg',
                            'local_url': 'local_url',
                            'meets_threshold': True,
                            'comic_name': 'Comic Book One',
                            'issue_number': '1',
                            'comic_vine_id': 1001,
                            'parent_comic_vine_id': 2001,
                            'match_details': {'key': 'value'},
                            'candidate_features': {'features': [1,2,3]},
                            'source_image_index': 0,
                            'source_image_name': 'image1.jpg'
                        }
                    ],
                    'total_matches': 1,
                    'query_type': 'multiple_images_search',
                    'source_image_index': 0
                }
            ],
            'summary': {
                'total_images_processed': 2,
                'successful_images': 2,
                'failed_images': 0,
                'total_matches_all_images': 2,
                'total_covers_processed': 2,
                'total_urls_processed': 2
            },
            'session_id': self.session_id,
            'status': 'completed',
            'series_name': 'Multiple Images Search',
            'year': None,
            'total_images': 2,
            'processed': 2,
            'successful_matches': 2,
            'failed_uploads': 0,
            'no_matches': 0,
            'overall_success': True,
            'best_similarity': 0.95,
            'similarity_threshold': 0.7,
            'total_covers_processed': 2,
            'total_urls_processed': 2,
            'query_type': 'multiple_images_search'
        }

        # Act
        result = self.service.process_multiple_images_with_centralized_progress(
            self.session_id, self.query_images_data, self.candidate_covers
        )

        # Assert
        self.assertIsNotNone(result)
        self.assertEqual(result['session_id'], self.session_id)
        self.assertEqual(len(result['results']), 2)
        self.assertTrue(mock_logger.info.called)
        self.assertTrue(self.mock_java_reporter.update_progress.called)
        self.assertTrue(self.mock_java_reporter.send_complete.called)

    @patch('services.ImageMatcherService.logger')
    def test_process_multiple_images_with_centralized_progress_no_candidates(self, mock_logger):
        """Test processing when no candidate covers are provided."""
        # Arrange
        empty_covers = []
        expected_error = "No valid URLs found in candidate covers"
        
        # Act & Assert
        with self.assertRaises(ValueError) as context:
            self.service.process_multiple_images_with_centralized_progress(
                self.session_id, self.query_images_data, empty_covers
            )
        
        self.assertIn(expected_error, str(context.exception))

    @patch('services.ImageMatcherService.logger')
    def test_process_multiple_images_with_centralized_progress_error_handling(self, mock_logger):
        """Test error handling during processing."""
        # Arrange
        self.mock_matcher.match.side_effect = Exception("Processing error")
        
        # Act
        with self.assertRaises(Exception):
            self.service.process_multiple_images_with_centralized_progress(
                self.session_id, self.query_images_data, self.candidate_covers
            )
        
        # Assert
        self.assertTrue(self.mock_java_reporter.send_error.called)
        self.assertTrue(mock_logger.error.called)

    def test_save_multiple_images_matcher_result(self):
        """Test saving of multiple images matcher results."""
        # Arrange
        result_data = {
            'results': [],
            'summary': {
                'total_images_processed': 2,
                'successful_images': 2,
                'failed_images': 0,
                'total_matches_all_images': 2,
                'total_covers_processed': 2,
                'total_urls_processed': 2
            },
            'session_id': self.session_id
        }
        
        all_results_with_images = [
            {
                'image_name': 'image1.jpg',
                'image_data': b"fake_image_data_1",
                'image_index': 0,
                'top_matches': [
                    {
                        'similarity': 0.95,
                        'url': 'http://example.com/cover1.jpg',
                        'comic_name': 'Comic Book One',
                        'issue_number': '1',
                        'comic_vine_id': 1001,
                        'parent_comic_vine_id': 2001,
                        'match_details': {'key': 'value'},
                        'candidate_features': {'features': [1,2,3]},
                        'source_image_index': 0,
                        'source_image_name': 'image1.jpg'
                    }
                ],
                'total_matches': 1,
                'error': None
            }
        ]

        # Act
        result = self.service.save_multiple_images_matcher_result(
            self.session_id, result_data, self.query_images_data, all_results_with_images
        )

        # Assert
        self.assertIsNotNone(result)
        self.assertEqual(result['session_id'], self.session_id)
        self.assertEqual(len(result['results']), 1)

    def test_save_multiple_images_matcher_result_error_handling(self):
        """Test error handling during result saving."""
        # Arrange
        with patch('services.ImageMatcherService.json.dump') as mock_dump:
            mock_dump.side_effect = Exception("JSON serialization error")
            
            # Act
            result = self.service.save_multiple_images_matcher_result(
                self.session_id, {}, [], []
            )
            
            # Assert
            self.assertIsNone(result)


if __name__ == '__main__':
    unittest.main()